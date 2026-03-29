import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  CircleX,
  Download,
  Plus,
  RotateCcw,
  Upload,
  Wallet,
} from "lucide-react";

const STORAGE_BILLS = "billbook_bills_v1";
const STORAGE_PAID = "billbook_paid_v1";
const STORAGE_BUDGET = "billbook_monthly_budget_v1";

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
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

function isActiveInMonth(bill, monthKey) {
  const m = parseMonthKey(monthKey);
  const start = bill.startMonth ? parseMonthKey(bill.startMonth) : new Date(2000, 0, 1);
  const end = bill.endMonth ? parseMonthKey(bill.endMonth) : null;

  if (m < start) return false;
  if (end && m > end) return false;

  const diff = diffInMonths(start, m);

  if (bill.freq?.type === "annual") return diff % 12 === 0;
  if (bill.freq?.type === "everyN") {
    const n = Math.max(1, Number(bill.freq.interval || 1));
    return diff % n === 0;
  }

  return true;
}

function dueDateForMonth(bill, monthKey) {
  const m = parseMonthKey(monthKey);
  const y = m.getFullYear();
  const mi = m.getMonth();
  const day = clampDayToMonth(y, mi, Number(bill.dueDay || 1));
  return new Date(y, mi, day, 12, 0, 0, 0);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function currency(n) {
  return `€${Number(n || 0).toFixed(2)}`;
}

function cardStyle() {
  return {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
  };
}

function buttonStyle(variant = "primary") {
  const base = {
    borderRadius: 12,
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    cursor: "pointer",
    fontWeight: 600,
    background: "white",
    fontSize: 14,
  };

  if (variant === "primary") {
    return {
      ...base,
      background: "#111827",
      color: "white",
      border: "1px solid #111827",
    };
  }

  if (variant === "danger") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#be123c",
      border: "1px solid #fecdd3",
    };
  }

  if (variant === "ghost") {
    return {
      ...base,
      background: "transparent",
    };
  }

  return base;
}

function inputStyle() {
  return {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    boxSizing: "border-box",
    background: "white",
  };
}

function SummaryTile({ label, value, note }) {
  return (
    <div style={{ ...cardStyle(), padding: 16 }}>
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          color: "#6b7280",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
        {currency(value)}
      </div>
      {note ? (
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{note}</div>
      ) : null}
    </div>
  );
}

function BillFormModal({ open, onClose, initial, onSave }) {
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

  useEffect(() => {
    setName(initial?.name || "");
    setAmount(initial?.amount ?? "");
    setDueDay(initial?.dueDay ?? 1);
    setCategory(initial?.category || "");
    setNotes(initial?.notes || "");
    setAutopay(Boolean(initial?.autopay));
    setFreqType(initial?.freq?.type || "monthly");
    setInterval(initial?.freq?.interval || 2);
    setStartMonth(initial?.startMonth || monthKeyFromDate());
    setEndMonth(initial?.endMonth || "");
  }, [initial, open]);

  if (!open) return null;

  function handleSubmit(e) {
    e.preventDefault();
    const amt = Number(amount);

    if (!name.trim() || Number.isNaN(amt) || amt < 0) {
      alert("Please enter a valid bill name and amount.");
      return;
    }

    const bill = {
      id: initial?.id || crypto.randomUUID(),
      name: name.trim(),
      amount: Math.round(amt * 100) / 100,
      dueDay: Number(dueDay) || 1,
      category: category.trim(),
      notes: notes.trim(),
      autopay,
      freq:
        freqType === "monthly"
          ? { type: "monthly" }
          : freqType === "annual"
          ? { type: "annual" }
          : { type: "everyN", interval: Number(interval) || 2 },
      startMonth: startMonth || monthKeyFromDate(),
      endMonth: endMonth || undefined,
    };

    onSave(bill);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        style={{
          ...cardStyle(),
          width: "min(760px, 100%)",
          padding: 20,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          {initial ? "Edit bill" : "Add bill"}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <label>Bill name</label>
              <input
                style={inputStyle()}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rent"
              />
            </div>

            <div>
              <label>Amount (€)</label>
              <input
                style={inputStyle()}
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div>
              <label>Due day</label>
              <input
                style={inputStyle()}
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>

            <div>
              <label>Category</label>
              <input
                style={inputStyle()}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Utilities"
              />
            </div>

            <div>
              <label>Frequency</label>
              <select
                style={inputStyle()}
                value={freqType}
                onChange={(e) => setFreqType(e.target.value)}
              >
                <option value="monthly">Monthly</option>
                <option value="everyN">Every N months</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            {freqType === "everyN" ? (
              <div>
                <label>Interval (months)</label>
                <input
                  style={inputStyle()}
                  type="number"
                  min="2"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                />
              </div>
            ) : null}

            <div>
              <label>Start month</label>
              <input
                style={inputStyle()}
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>

            <div>
              <label>End month (optional)</label>
              <input
                style={inputStyle()}
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
              />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={autopay}
              onChange={(e) => setAutopay(e.target.checked)}
            />
            Autopay enabled
          </label>

          <div>
            <label>Notes</label>
            <textarea
              style={{ ...inputStyle(), minHeight: 90 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Account number, login details, renewal notes..."
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" style={buttonStyle("secondary")} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" style={buttonStyle("primary")}>
              {initial ? "Save changes" : "Add bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [bills, setBills] = useState(() => loadJson(STORAGE_BILLS, []));
  const [paidMap, setPaidMap] = useState(() => loadJson(STORAGE_PAID, {}));
  const [monthlyBudget, setMonthlyBudget] = useState(
    () => Number(localStorage.getItem(STORAGE_BUDGET) || 0)
  );
  const [monthKey, setMonthKey] = useState(monthKeyFromDate());
  const [search, setSearch] = useState("");
  const [showOnlyDue, setShowOnlyDue] = useState(false);
  const [sortBy, setSortBy] = useState("due-asc");
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => saveJson(STORAGE_BILLS, bills), [bills]);
  useEffect(() => saveJson(STORAGE_PAID, paidMap), [paidMap]);
  useEffect(() => {
    localStorage.setItem(STORAGE_BUDGET, String(Number(monthlyBudget || 0)));
  }, [monthlyBudget]);

  const monthBills = useMemo(() => {
    return bills.filter((b) => isActiveInMonth(b, monthKey));
  }, [bills, monthKey]);

  const filteredBills = useMemo(() => {
    const paid = paidMap[monthKey] || {};

    const result = monthBills.filter((b) => {
      const matches = `${b.name} ${b.category || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());

      if (!matches) return false;
      if (!showOnlyDue) return true;
      return !paid[b.id];
    });

    result.sort((a, b) => {
      if (sortBy === "due-asc") {
        return dueDateForMonth(a, monthKey) - dueDateForMonth(b, monthKey);
      }
      if (sortBy === "due-desc") {
        return dueDateForMonth(b, monthKey) - dueDateForMonth(a, monthKey);
      }
      if (sortBy === "amount-asc") {
        return Number(a.amount || 0) - Number(b.amount || 0);
      }
      if (sortBy === "amount-desc") {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [monthBills, monthKey, paidMap, search, showOnlyDue, sortBy]);

  const totals = useMemo(() => {
    const paid = paidMap[monthKey] || {};
    const totalBills = monthBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const totalPaid = monthBills.reduce(
      (sum, b) => sum + (paid[b.id] ? Number(b.amount || 0) : 0),
      0
    );
    const totalUnpaid = totalBills - totalPaid;
    const budget = Number(monthlyBudget || 0);
    const actualRemainingBudget = budget - totalBills;
    const cashLeftRightNow = budget - totalPaid;

    return {
      totalBills,
      totalPaid,
      totalUnpaid,
      actualRemainingBudget,
      cashLeftRightNow,
    };
  }, [monthBills, monthKey, paidMap, monthlyBudget]);

  function markPaid(billId, value) {
    setPaidMap((prev) => {
      const nextMonth = { ...(prev[monthKey] || {}) };
      if (value) nextMonth[billId] = true;
      else delete nextMonth[billId];
      return { ...prev, [monthKey]: nextMonth };
    });
  }

  function exportData() {
    const payload = { bills, paidMap, monthlyBudget };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
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
        setBills(data.bills || []);
        setPaidMap(data.paidMap || {});
        setMonthlyBudget(Number(data.monthlyBudget || 0));
        alert("Import successful");
      } catch {
        alert("Could not import that file.");
      }
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    if (!window.confirm("This will erase all bills and payment history. Continue?")) {
      return;
    }
    setBills([]);
    setPaidMap({});
    setMonthlyBudget(0);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: 24,
        fontFamily: "Inter, system-ui, Arial, sans-serif",
        color: "#111827",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 20 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Wallet size={28} />
              <h1 style={{ margin: 0, fontSize: 34 }}>BillBook</h1>
            </div>
            <div style={{ color: "#6b7280", marginTop: 6 }}>
              Track bills every month, mark payments, and keep your real remaining
              budget visible.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={buttonStyle()} onClick={exportData}>
              <Download size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Export
            </button>

            <label
              style={{
                ...buttonStyle(),
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Upload size={16} />
              Import
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
              />
            </label>

            <button style={buttonStyle("danger")} onClick={resetAllData}>
              <RotateCcw
                size={16}
                style={{ marginRight: 6, verticalAlign: "middle" }}
              />
              Reset
            </button>
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                style={buttonStyle()}
                onClick={() =>
                  setMonthKey(monthKeyFromDate(addMonths(parseMonthKey(monthKey), -1)))
                }
              >
                ◀
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                <CalendarDays size={18} /> {monthKey}
              </div>

              <button
                style={buttonStyle()}
                onClick={() =>
                  setMonthKey(monthKeyFromDate(addMonths(parseMonthKey(monthKey), 1)))
                }
              >
                ▶
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <input
                style={{ ...inputStyle(), width: 220 }}
                placeholder="Search bills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                style={{ ...inputStyle(), width: 220 }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="due-asc">Due date: earliest first</option>
                <option value="due-desc">Due date: latest first</option>
                <option value="amount-asc">Amount: low to high</option>
                <option value="amount-desc">Amount: high to low</option>
                <option value="name">Name: A to Z</option>
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={showOnlyDue}
                  onChange={(e) => setShowOnlyDue(e.target.checked)}
                />
                Hide paid
              </label>

              <button
                style={buttonStyle("primary")}
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Add bill
              </button>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              alignItems: "end",
            }}
          >
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Monthly budget (€)
              </label>
              <input
                style={inputStyle()}
                type="number"
                step="0.01"
                min="0"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Number(e.target.value || 0))}
              />
            </div>

            <div style={{ color: "#6b7280", fontSize: 14 }}>
              Actual remaining budget = monthly budget minus all bills due for the
              selected month.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <SummaryTile label="Monthly budget" value={monthlyBudget} />
          <SummaryTile label="Total bills this month" value={totals.totalBills} />
          <SummaryTile label="Already paid" value={totals.totalPaid} />
          <SummaryTile label="Still to pay" value={totals.totalUnpaid} />
          <SummaryTile
            label="Actual remaining budget"
            value={totals.actualRemainingBudget}
            note="This does not change when bills are marked paid."
          />
        </div>

        <div style={{ ...cardStyle(), padding: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  color: "#6b7280",
                }}
              >
                Actual remaining budget
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, marginTop: 6 }}>
                {currency(totals.actualRemainingBudget)}
              </div>
              <div style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>
                This stays fixed for the month unless your budget or bills change.
              </div>
            </div>

            <div
              style={{
                ...cardStyle(),
                padding: 16,
                minWidth: 250,
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  color: "#6b7280",
                }}
              >
                Cash left right now
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                {currency(totals.cashLeftRightNow)}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
                This changes when you mark bills as paid.
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle(), overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  {[
                    "Bill",
                    "Category",
                    "Due",
                    "Amount",
                    "Budget after bill",
                    "Autopay",
                    "Paid",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign:
                          h === "Amount" || h === "Budget after bill" || h === "Actions"
                            ? "right"
                            : "left",
                        padding: 14,
                        fontSize: 13,
                        color: "#6b7280",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredBills.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ padding: 28, textAlign: "center", color: "#6b7280" }}
                    >
                      No bills match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((bill) => {
                    const paid = Boolean(paidMap[monthKey]?.[bill.id]);
                    const due = dueDateForMonth(bill, monthKey);
                    const today = stripTime(new Date());
                    const overdue = !paid && today > stripTime(due);
                    const dueSoon =
                      !paid && !overdue && daysBetween(today, stripTime(due)) <= 7;

                    return (
                      <tr key={bill.id}>
                        <td style={{ padding: 14, borderTop: "1px solid #e5e7eb" }}>
                          <div style={{ fontWeight: 600 }}>{bill.name}</div>
                          {bill.notes ? (
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                              {bill.notes}
                            </div>
                          ) : null}
                        </td>

                        <td style={{ padding: 14, borderTop: "1px solid #e5e7eb" }}>
                          {bill.category || "—"}
                        </td>

                        <td style={{ padding: 14, borderTop: "1px solid #e5e7eb" }}>
                          <span
                            style={{
                              fontSize: 12,
                              border: "1px solid #e5e7eb",
                              background: overdue
                                ? "#fff1f2"
                                : dueSoon
                                ? "#fffbeb"
                                : "white",
                              color: overdue
                                ? "#be123c"
                                : dueSoon
                                ? "#b45309"
                                : "#374151",
                              borderRadius: 999,
                              padding: "4px 8px",
                            }}
                          >
                            {due.toLocaleDateString(undefined, {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </td>

                        <td
                          style={{
                            padding: 14,
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                          }}
                        >
                          {currency(bill.amount)}
                        </td>

                        <td
                          style={{
                            padding: 14,
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                          }}
                        >
                          {currency(Number(monthlyBudget || 0) - Number(bill.amount || 0))}
                        </td>

                        <td style={{ padding: 14, borderTop: "1px solid #e5e7eb" }}>
                          {bill.autopay ? "Yes" : "No"}
                        </td>

                        <td style={{ padding: 14, borderTop: "1px solid #e5e7eb" }}>
                          {paid ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                color: "#15803d",
                              }}
                            >
                              <CheckCircle2 size={16} />
                              Paid
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td
                          style={{
                            padding: 14,
                            borderTop: "1px solid #e5e7eb",
                            textAlign: "right",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              justifyContent: "flex-end",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              style={buttonStyle(paid ? "secondary" : "primary")}
                              onClick={() => markPaid(bill.id, !paid)}
                            >
                              {paid ? "Undo" : "Mark paid"}
                            </button>

                            <button
                              style={buttonStyle()}
                              onClick={() => {
                                setEditing(bill);
                                setModalOpen(true);
                              }}
                            >
                              Edit
                            </button>

                            <button
                              style={buttonStyle("danger")}
                              onClick={() =>
                                setBills((prev) => prev.filter((x) => x.id !== bill.id))
                              }
                            >
                              <CircleX size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <BillFormModal
          open={modalOpen}
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={(bill) => {
            if (editing) {
              setBills((prev) => prev.map((b) => (b.id === editing.id ? bill : b)));
            } else {
              setBills((prev) => [{ ...bill, id: crypto.randomUUID() }, ...prev]);
            }
            setEditing(null);
          }}
        />
      </motion.div>
    </div>
  );
}