import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, CheckCircle2, CircleX, Download, Plus, RotateCcw, Upload, Wallet } from "lucide-react";

// -----------------------------
// Utility helpers
// -----------------------------

const STORAGE_BILLS = "billbook_bills_v1";
const STORAGE_PAID = "billbook_paid_v1";

function monthKeyFromDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function diffInMonths(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function clampDayToMonth(year, monthIndex, day) {
  // monthIndex is 0-based
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

// -----------------------------
// Types
// -----------------------------

/**
 * Bill shape
 * id: string
 * name: string
 * amount: number (in currency unit)
 * dueDay: 1..31
 * category: string
 * notes: string
 * autopay: boolean
 * freq: { type: 'monthly' | 'everyN' | 'annual', interval?: number }
 * startMonth: 'YYYY-MM' (first month bill should appear)
 * endMonth?: 'YYYY-MM' (optional last month it appears)
 */

// Determine if bill is active in given month
function isActiveInMonth(bill, monthKey) {
  const m = parseMonthKey(monthKey);
  const start = bill.startMonth ? parseMonthKey(bill.startMonth) : new Date(2000, 0, 1);
  const end = bill.endMonth ? parseMonthKey(bill.endMonth) : null;
  if (m < start) return false;
  if (end && m > end) return false;
  // Frequency handling
  const diff = diffInMonths(start, m);
  if (bill.freq?.type === "annual") {
    return diff % 12 === 0;
  }
  if (bill.freq?.type === "everyN") {
    const n = Math.max(1, Number(bill.freq.interval || 1));
    return diff % n === 0;
  }
  // default monthly
  return true;
}

function dueDateForMonth(bill, monthKey) {
  const m = parseMonthKey(monthKey);
  const y = m.getFullYear();
  const mi = m.getMonth();
  const day = clampDayToMonth(y, mi, Number(bill.dueDay || 1));
  return new Date(y, mi, day, 12, 0, 0, 0);
}

// -----------------------------
// Storage helpers
// -----------------------------

function loadBills() {
  try {
    const raw = localStorage.getItem(STORAGE_BILLS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBills(bills) {
  localStorage.setItem(STORAGE_BILLS, JSON.stringify(bills));
}

function loadPaidMap() {
  try {
    const raw = localStorage.getItem(STORAGE_PAID);
    return raw ? JSON.parse(raw) : {}; // { [monthKey]: { [billId]: true } }
  } catch {
    return {};
  }
}

function savePaidMap(map) {
  localStorage.setItem(STORAGE_PAID, JSON.stringify(map));
}

// -----------------------------
// Main App
// -----------------------------

export default function App() {
  const [bills, setBills] = useState(() => loadBills());
  const [paidMap, setPaidMap] = useState(() => loadPaidMap());
  const [monthKey, setMonthKey] = useState(() => monthKeyFromDate());
  const [search, setSearch] = useState("");
  const [showOnlyDue, setShowOnlyDue] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    try {
      return Number(localStorage.getItem("billbook_monthly_budget_v1") || 0);
    } catch {
      return 0;
    }
  });
  const [editing, setEditing] = useState(null); // bill | null

  useEffect(() => {
    saveBills(bills);
  }, [bills]);

  useEffect(() => {
    savePaidMap(paidMap);
  }, [paidMap]);

  useEffect(() => {
    localStorage.setItem("billbook_monthly_budget_v1", String(Number(monthlyBudget || 0)));
  }, [monthlyBudget]);

  // Bills for selected month
  const monthBills = useMemo(() => {
    return bills.filter((b) => isActiveInMonth(b, monthKey));
  }, [bills, monthKey]);

  const filteredBills = useMemo(() => {
    const paid = paidMap[monthKey] || {};
    return monthBills.filter((b) => {
      const matches = `${b.name} ${b.category || ""}`.toLowerCase().includes(search.toLowerCase());
      if (!matches) return false;
      if (!showOnlyDue) return true;
      return !paid[b.id];
    });
  }, [monthBills, monthKey, paidMap, search, showOnlyDue]);

  const totals = useMemo(() => {
    const paid = paidMap[monthKey] || {};
    const due = monthBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const paidAmt = monthBills.reduce((sum, b) => sum + (paid[b.id] ? Number(b.amount || 0) : 0), 0);
    const unpaidBills = due - paidAmt;
    const actualRemainingBudget = Number(monthlyBudget || 0) - due;
    const cashRemainingAfterPayments = Number(monthlyBudget || 0) - paidAmt;
    return {
      due,
      paid: paidAmt,
      remaining: unpaidBills,
      actualRemainingBudget,
      cashRemainingAfterPayments,
    };
  }, [monthBills, monthKey, paidMap, monthlyBudget]);

  function markPaid(billId, value) {
    setPaidMap((prev) => {
      const m = { ...(prev[monthKey] || {}) };
      if (value) m[billId] = true; else delete m[billId];
      return { ...prev, [monthKey]: m };
    });
  }

  function prevMonth() {
    setMonthKey((mk) => monthKeyFromDate(addMonths(parseMonthKey(mk), -1)));
  }

  function nextMonth() {
    setMonthKey((mk) => monthKeyFromDate(addMonths(parseMonthKey(mk), 1)));
  }

  function resetAllData() {
    if (!confirm("This will erase all bills and payment history. Continue?")) return;
    setBills([]);
    setPaidMap({});
  }

  function exportData() {
    const payload = { bills, paidMap };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billbook_backup_${monthKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.bills && data.paidMap) {
          setBills(data.bills);
          setPaidMap(data.paidMap);
          alert("Import successful ✔");
        } else {
          alert("Invalid file format");
        }
      } catch (e) {
        alert("Failed to import file");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Wallet className="h-7 w-7"/> BillBook</h1>
            <p className="text-sm text-neutral-600">Track bills, mark payments, and stay on top of due dates — all saved locally in your browser.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={exportData} className="gap-2"><Download className="h-4 w-4"/>Export</Button>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm cursor-pointer hover:bg-neutral-50">
              <Upload className="h-4 w-4"/>
              <span>Import</span>
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
            </label>
            <Button variant="destructive" onClick={resetAllData} className="gap-2"><RotateCcw className="h-4 w-4"/>Reset</Button>
          </div>
        </header>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={prevMonth}>◀</Button>
                <div className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5"/>{monthKey}</div>
                <Button variant="ghost" onClick={nextMonth}>▶</Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input placeholder="Search bills..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-60"/>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border">
                  <Checkbox id="dueOnly" checked={showOnlyDue} onCheckedChange={(v) => setShowOnlyDue(Boolean(v))} />
                  <Label htmlFor="dueOnly" className="text-sm">Hide paid</Label>
                </div>
                <BillDialog
                  key={editing?.id || "new"}
                  trigger={(open) => (
                    <Button className="gap-2" onClick={() => open()}>
                      <Plus className="h-4 w-4"/>
                      Add bill
                    </Button>
                  )}
                  initial={editing}
                  onSave={(bill) => {
                    if (editing) {
                      setBills((prev) => prev.map((b) => (b.id === editing.id ? bill : b)));
                      setEditing(null);
                    } else {
                      setBills((prev) => [{ ...bill, id: uuidv4() }, ...prev]);
                    }
                  }}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <SummaryTile label="Monthly budget" value={monthlyBudget} />
              <SummaryTile label="Bills due" value={totals.due} />
              <SummaryTile label="Bills paid" value={totals.paid} positive />
              <SummaryTile label="Bills left to pay" value={totals.remaining} emphasize />
              <SummaryTile label="Actual remaining budget" value={totals.actualRemainingBudget} positive={totals.actualRemainingBudget >= 0} emphasize={totals.actualRemainingBudget < 0} />
            </div>

            <Card className="shadow-sm border-dashed">
              <CardContent className="py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-sm font-medium">Monthly budget</div>
                    <p className="text-xs text-neutral-600">This stays based on your full monthly budget and total bills due, so marking bills as paid does not change the actual remaining budget figure.</p>
                  </div>
                  <div className="grid gap-2 md:w-64">
                    <Label htmlFor="monthly-budget">Set monthly budget (€)</Label>
                    <Input
                      id="monthly-budget"
                      type="number"
                      step="0.01"
                      min="0"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-700">
                  <tr>
                    <th className="p-3 text-left">Bill</th>
                    <th className="p-3 text-left">Category</th>
                    <th className="p-3 text-left">Due</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Budget after bill</th>
                    <th className="p-3 text-center">Autopay</th>
                    <th className="p-3 text-center">Paid</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-neutral-500">No bills match your filters.</td>
                    </tr>
                  )}
                  {filteredBills.map((b) => {
                    const paid = Boolean(paidMap[monthKey]?.[b.id]);
                    const due = dueDateForMonth(b, monthKey);
                    const today = new Date();
                    const isOverdue = !paid && addDays(stripTime(today), 0) > stripTime(due);
                    const dueSoon = !paid && !isOverdue && daysBetween(stripTime(today), stripTime(due)) <= 7;

                    return (
                      <tr key={b.id} className="border-t">
                        <td className="p-3">
                          <div className="font-medium">{b.name}</div>
                          {b.notes && <div className="text-xs text-neutral-500 max-w-[42ch] truncate">{b.notes}</div>}
                        </td>
                        <td className="p-3">{b.category || "—"}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${isOverdue ? "border-red-300 bg-red-50 text-red-700" : dueSoon ? "border-amber-300 bg-amber-50 text-amber-700" : "border-neutral-200 bg-white text-neutral-700"}`}>
                            {due.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">€{Number(b.amount || 0).toFixed(2)}</td>
                        <td className="p-3 text-right tabular-nums">€{(Number(monthlyBudget || 0) - Number(b.amount || 0)).toFixed(2)}</td>
                        <td className="p-3 text-center">{b.autopay ? "Yes" : "No"}</td>
                        <td className="p-3 text-center">
                          {paid ? (
                            <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4"/>Paid</span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant={paid ? "secondary" : "default"} size="sm" onClick={() => markPaid(b.id, !paid)}>
                              {paid ? "Undo" : "Mark paid"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => setBills((prev) => prev.filter((x) => x.id !== b.id))}>
                              <CircleX className="h-4 w-4"/>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Tips />
      </motion.div>
    </div>
  );
}

function SummaryTile({ label, value, emphasize, positive }) {
  return (
    <Card className={`shadow-sm ${emphasize ? "border-amber-300" : ""}`}>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={`text-2xl font-semibold ${positive ? "text-green-700" : emphasize ? "text-amber-700" : ""}`}>€{Number(value || 0).toFixed(2)}</div>
      </CardContent>
    </Card>
  );
}

function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function daysBetween(a, b) { return Math.round((b - a) / (1000 * 60 * 60 * 24)); }

function Tips() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">How it works</CardTitle></CardHeader>
        <CardContent className="text-sm text-neutral-600 space-y-1">
          <p>• Add your bills once. Choose how often they recur (monthly, every N months, annual) and a start month.</p>
          <p>• Pick a month at the top to see what’s due, then mark items as paid.</p>
          <p>• Set your monthly budget once. The app keeps your actual remaining budget based on total bills due, so paying a bill does not reduce that figure again.</p>
          <p>• Everything saves to your browser (no sign-in). Export/Import to back up or move devices.</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">Pro tips</CardTitle></CardHeader>
        <CardContent className="text-sm text-neutral-600 space-y-1">
          <p>• Turn on <span className="font-medium">Autopay</span> for bills that charge automatically, then just reconcile monthly.</p>
          <p>• Use <span className="font-medium">Notes</span> to store account numbers, contact info, or renewal dates.</p>
          <p>• Use <span className="font-medium">Search</span> and <span className="font-medium">Hide paid</span> to quickly find what’s left.</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">Roadmap (ideas)</CardTitle></CardHeader>
        <CardContent className="text-sm text-neutral-600 space-y-1">
          <p>• Email/SMS reminders, shared household mode</p>
          <p>• Bank sync via Plaid/TrueLayer (read-only)</p>
          <p>• Multi-currency + budgets & charts</p>
        </CardContent>
      </Card>
    </div>
  );
}

function BillDialog({ trigger, initial, onSave }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [dueDay, setDueDay] = useState(initial?.dueDay ?? 1);
  const [category, setCategory] = useState(initial?.category || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [autopay, setAutopay] = useState(Boolean(initial?.autopay));
  const [freqType, setFreqType] = useState(initial?.freq?.type || "monthly");
  const [interval, setInterval] = useState(initial?.freq?.interval || 2);
  const [startMonth, setStartMonth] = useState(initial?.startMonth || monthKeyFromDate());
  const [endMonth, setEndMonth] = useState(initial?.endMonth || "");

  function handleSubmit(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim() || isNaN(amt) || amt < 0) {
      alert("Please enter a valid name and amount.");
      return;
    }
    const bill = {
      id: initial?.id || uuidv4(),
      name: name.trim(),
      amount: Math.round(amt * 100) / 100,
      dueDay: Number(dueDay) || 1,
      category: category.trim(),
      notes: notes.trim(),
      autopay: Boolean(autopay),
      freq: freqType === "monthly" ? { type: "monthly" } : freqType === "annual" ? { type: "annual" } : { type: "everyN", interval: Number(interval) || 2 },
      startMonth: startMonth || monthKeyFromDate(),
      endMonth: endMonth || undefined,
    };
    onSave?.(bill);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger(() => setOpen(true))}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit bill" : "Add a bill"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Bill name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Rent" required />
            </div>
            <div className="grid gap-2">
              <Label>Amount (€)</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </div>
            <div className="grid gap-2">
              <Label>Due day</Label>
              <Input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., Utilities" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Frequency</Label>
              <Select value={freqType} onValueChange={setFreqType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="everyN">Every N months</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {freqType === "everyN" && (
              <div className="grid gap-2">
                <Label>Interval (months)</Label>
                <Input type="number" min="2" value={interval} onChange={(e) => setInterval(e.target.value)} />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Autopay</Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border">
                <Checkbox checked={autopay} onCheckedChange={(v) => setAutopay(Boolean(v))} />
                <span className="text-sm">This bill charges automatically</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Start month</Label>
              <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>End month (optional)</Label>
              <Input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Account #, login URL, terms, etc." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">{initial ? "Save changes" : "Add bill"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
