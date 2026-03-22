import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "monthly-bills-app-v2";
const RESET_DAY = 25;

function currency(value) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function getCycleStart(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (day >= RESET_DAY) {
    return new Date(year, month, RESET_DAY);
  }

  return new Date(year, month - 1, RESET_DAY);
}

function getCycleId(date = new Date()) {
  const start = getCycleStart(date);
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

function getNextDueDate(dayOfMonth, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  const daysInThisMonth = new Date(year, month + 1, 0).getDate();
  const thisMonthDueDay = Math.min(dayOfMonth, daysInThisMonth);
  const dueThisMonth = new Date(year, month, thisMonthDueDay);

  const today = new Date(year, month, now.getDate());

  if (dueThisMonth >= today) {
    return dueThisMonth;
  }

  const daysInNextMonth = new Date(year, month + 2, 0).getDate();
  const nextMonthDueDay = Math.min(dayOfMonth, daysInNextMonth);
  return new Date(year, month + 1, nextMonthDueDay);
}

function daysUntil(date, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = target.getTime() - startOfToday.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadBudget() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-budget`);
    return raw ?? "";
  } catch {
    return "";
  }
}

function buttonStyle(active = false) {
  return {
    padding: "10px 14px",
    borderRadius: "12px",
    border: active ? "1px solid #111827" : "1px solid #d1d5db",
    background: active ? "#111827" : "#ffffff",
    color: active ? "#ffffff" : "#111827",
    cursor: "pointer",
    fontWeight: 600,
  };
}

function cardStyle() {
  return {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "18px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  };
}

export default function MonthlyBillsApp() {
  const [bills, setBills] = useState(() => loadData());
  const [filter, setFilter] = useState("all");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [saveMessage, setSaveMessage] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [editingBillId, setEditingBillId] = useState(null);

  const cycleId = getCycleId(new Date());
  const cycleStart = getCycleStart(new Date());

  useEffect(() => {
    setMonthlyBudget(loadBudget());

    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(bills));
    setSaveMessage("Bills saved on this browser.");

    const timer = setTimeout(() => setSaveMessage(""), 2000);
    return () => clearTimeout(timer);
  }, [bills, hasLoaded]);

  useEffect(() => {
    if (!hasLoaded) return;

    localStorage.setItem(`${STORAGE_KEY}-budget`, monthlyBudget);
  }, [monthlyBudget, hasLoaded]);

  const normalizedBills = useMemo(() => {
    return bills.map((bill) => {
      const isPaid = bill.lastPaidCycleId === cycleId;
      const dueDate = getNextDueDate(Number(bill.dueDay));
      const dueInDays = daysUntil(dueDate);

      return {
        ...bill,
        isPaid,
        dueDate,
        dueInDays,
      };
    });
  }, [bills, cycleId]);

  const filteredBills = useMemo(() => {
    if (filter === "paid") return normalizedBills.filter((bill) => bill.isPaid);
    if (filter === "unpaid") return normalizedBills.filter((bill) => !bill.isPaid);
    return normalizedBills;
  }, [normalizedBills, filter]);

  const outstanding = useMemo(() => {
    return normalizedBills
      .filter((bill) => !bill.isPaid)
      .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  }, [normalizedBills]);

  const paidTotal = useMemo(() => {
    return normalizedBills
      .filter((bill) => bill.isPaid)
      .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  }, [normalizedBills]);

  const dueSoon = useMemo(() => {
    return normalizedBills
      .filter((bill) => !bill.isPaid && bill.dueInDays <= 3)
      .sort((a, b) => a.dueInDays - b.dueInDays);
  }, [normalizedBills]);

  const remainingBudget = useMemo(() => {
    const budget = Number(monthlyBudget || 0);
    return budget - outstanding;
  }, [monthlyBudget, outstanding]);

  const budgetUsed = useMemo(() => {
    const budget = Number(monthlyBudget || 0);
    if (!budget || budget <= 0) return 0;
    return Math.min((outstanding / budget) * 100, 100);
  }, [monthlyBudget, outstanding]);

  useEffect(() => {
    if (!remindersEnabled) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const todayKey = `bill-reminders-${new Date().toISOString().slice(0, 10)}`;
    const alreadySent = JSON.parse(localStorage.getItem(todayKey) || "[]");

    const remindersToSend = normalizedBills.filter(
      (bill) =>
        !bill.isPaid &&
        bill.dueInDays >= 0 &&
        bill.dueInDays <= 1 &&
        !alreadySent.includes(bill.id)
    );

    remindersToSend.forEach((bill) => {
      const when = bill.dueInDays === 0 ? "due today" : "due tomorrow";
      new Notification(`Bill reminder: ${bill.name}`, {
        body: `${bill.name} is ${when} (${currency(bill.amount)}).`,
      });
    });

    if (remindersToSend.length) {
      localStorage.setItem(
        todayKey,
        JSON.stringify([...alreadySent, ...remindersToSend.map((b) => b.id)])
      );
    }
  }, [normalizedBills, remindersEnabled]);

  function requestNotifications() {
    if (!("Notification" in window)) return;

    Notification.requestPermission().then((permission) => {
      setNotificationPermission(permission);
      if (permission === "granted") {
        setRemindersEnabled(true);
      }
    });
  }

  function addBill(e) {
    e.preventDefault();

    if (!name.trim() || !amount || !dueDay) return;

    const numericAmount = Number(amount);
    const numericDueDay = Number(dueDay);

    if (Number.isNaN(numericAmount) || Number.isNaN(numericDueDay)) return;
    if (numericDueDay < 1 || numericDueDay > 31) return;

    if (editingBillId) {
      setBills((prev) =>
        prev.map((bill) =>
          bill.id === editingBillId
            ? {
                ...bill,
                name: name.trim(),
                amount: numericAmount,
                dueDay: numericDueDay,
              }
            : bill
        )
      );
      setEditingBillId(null);
      setSaveMessage("Bill updated successfully.");
    } else {
      const newBill = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        name: name.trim(),
        amount: numericAmount,
        dueDay: numericDueDay,
        createdAt: new Date().toISOString(),
        lastPaidCycleId: null,
      };

      setBills((prev) => [newBill, ...prev]);
    }

    setName("");
    setAmount("");
    setDueDay("");
  }

  function startEditBill(bill) {
    setEditingBillId(bill.id);
    setName(bill.name);
    setAmount(String(bill.amount));
    setDueDay(String(bill.dueDay));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingBillId(null);
    setName("");
    setAmount("");
    setDueDay("");
  }

  function togglePaid(billId) {
    setBills((prev) =>
      prev.map((bill) => {
        if (bill.id !== billId) return bill;

        const isCurrentlyPaid = bill.lastPaidCycleId === cycleId;

        return {
          ...bill,
          lastPaidCycleId: isCurrentlyPaid ? null : cycleId,
        };
      })
    );
  }

  function deleteBill(billId) {
    setBills((prev) => prev.filter((bill) => bill.id !== billId));
  }

  function clearAllBills() {
    setBills([]);
    localStorage.removeItem(STORAGE_KEY);
    setSaveMessage("All saved bills cleared.");
    setTimeout(() => setSaveMessage(""), 2000);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "24px",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ ...cardStyle(), marginBottom: "20px" }}>
          <h1 style={{ margin: 0, fontSize: "32px" }}>Monthly Bills Tracker</h1>
          <p style={{ marginTop: "8px", color: "#475569" }}>
            Track paid and unpaid bills, calculate what is outstanding, and reset
            each billing cycle on the 25th.
          </p>
          <p style={{ marginTop: "10px", fontSize: "14px", color: "#64748b" }}>
            Current cycle started on <strong>{formatLongDate(cycleStart)}</strong>
          </p>
          <p style={{ marginTop: "8px", fontSize: "14px", color: "#166534" }}>
            {saveMessage || "Bills are automatically saved in your browser."}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <div style={cardStyle()}>
            <div style={{ fontSize: "14px", color: "#64748b" }}>Outstanding</div>
            <div style={{ fontSize: "30px", fontWeight: 700, marginTop: "8px" }}>
              {currency(outstanding)}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: "14px", color: "#64748b" }}>Paid This Cycle</div>
            <div style={{ fontSize: "30px", fontWeight: 700, marginTop: "8px" }}>
              {currency(paidTotal)}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: "14px", color: "#64748b" }}>Total Bills</div>
            <div style={{ fontSize: "30px", fontWeight: 700, marginTop: "8px" }}>
              {normalizedBills.length}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: "14px", color: "#64748b" }}>Monthly Budget</div>
            <div style={{ fontSize: "30px", fontWeight: 700, marginTop: "8px" }}>
              {monthlyBudget ? currency(monthlyBudget) : "—"}
            </div>
            <div style={{ marginTop: "8px", fontSize: "13px", color: remainingBudget < 0 ? "#991b1b" : "#166534" }}>
              {monthlyBudget
                ? `${remainingBudget < 0 ? "Over by" : "Remaining"} ${currency(Math.abs(remainingBudget))}`
                : "Add your budget below"}
            </div>
            <div style={{ marginTop: "12px" }}>
              <div
                style={{
                  height: "10px",
                  width: "100%",
                  background: "#e5e7eb",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${budgetUsed}%`,
                    background: budgetUsed >= 100 ? "#dc2626" : budgetUsed >= 75 ? "#f59e0b" : "#16a34a",
                    borderRadius: "999px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
                {monthlyBudget ? `${Math.round(budgetUsed)}% of budget committed to unpaid bills` : "Set a monthly budget to see progress"}
              </div>
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "10px" }}>
              Reminders
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <span style={{ fontSize: "14px" }}>Browser notifications</span>
              <input
                type="checkbox"
                checked={remindersEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  if (checked && notificationPermission !== "granted") {
                    requestNotifications();
                  } else {
                    setRemindersEnabled(checked);
                  }
                }}
              />
            </label>

            <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "10px" }}>
              {notificationPermission === "granted"
                ? "Notifications are enabled for bills due today or tomorrow while the app is open."
                : "Allow notifications to receive reminders in your browser."}
            </p>

            {notificationPermission !== "granted" && (
              <button onClick={requestNotifications} style={buttonStyle(false)}>
                Enable Notifications
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
            gap: "20px",
          }}
        >
          <div style={cardStyle()}>
            <h2 style={{ marginTop: 0 }}>{editingBillId ? "Edit bill" : "Budget and bills"}</h2>

            <div style={{ marginBottom: "18px", padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e5e7eb" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                Monthly budget
              </label>
              <input
                type="number"
                step="0.01"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                placeholder="e.g. 2500"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid #d1d5db",
                  boxSizing: "border-box",
                }}
              />
              <p style={{ marginTop: "8px", marginBottom: 0, fontSize: "12px", color: "#64748b" }}>
                This is saved automatically in your browser and used to show how much budget remains after unpaid bills.
              </p>
            </div>

            <form onSubmit={addBill}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                  Bill name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rent, Electricity, Netflix"
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "12px",
                    border: "1px solid #d1d5db",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "12px",
                      border: "1px solid #d1d5db",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                    Due day
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    placeholder="15"
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "12px",
                      border: "1px solid #d1d5db",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <button type="submit" style={{ ...buttonStyle(true), width: "100%", marginBottom: "10px" }}>
                {editingBillId ? "Save Changes" : "Add Bill"}
              </button>

              {editingBillId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  style={{ ...buttonStyle(false), width: "100%", marginBottom: "10px" }}
                >
                  Cancel Edit
                </button>
              )}
            </form>

            <button
              type="button"
              onClick={clearAllBills}
              style={{ ...buttonStyle(false), width: "100%" }}
            >
              Clear All Saved Bills
            </button>
          </div>

          <div>
            <div style={{ ...cardStyle(), marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <h2 style={{ margin: 0 }}>Your bills</h2>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button style={buttonStyle(filter === "all")} onClick={() => setFilter("all")}>
                    All
                  </button>
                  <button style={buttonStyle(filter === "paid")} onClick={() => setFilter("paid")}>
                    Paid
                  </button>
                  <button
                    style={buttonStyle(filter === "unpaid")}
                    onClick={() => setFilter("unpaid")}
                  >
                    Unpaid
                  </button>
                </div>
              </div>

              {filteredBills.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #cbd5e1",
                    borderRadius: "16px",
                    padding: "24px",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  No bills yet. Add your first one to get started.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {filteredBills
                    .slice()
                    .sort((a, b) => a.dueInDays - b.dueInDays)
                    .map((bill) => (
                      <div
                        key={bill.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: "16px",
                          padding: "16px",
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "16px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                                marginBottom: "8px",
                              }}
                            >
                              <strong style={{ fontSize: "18px" }}>{bill.name}</strong>
                              <span
                                style={{
                                  fontSize: "12px",
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  background: bill.isPaid ? "#dcfce7" : "#fee2e2",
                                  color: bill.isPaid ? "#166534" : "#991b1b",
                                  fontWeight: 700,
                                }}
                              >
                                {bill.isPaid ? "Paid" : "Unpaid"}
                              </span>
                            </div>

                            <div style={{ fontSize: "14px", color: "#475569", lineHeight: 1.7 }}>
                              <div><strong>Amount:</strong> {currency(bill.amount)}</div>
                              <div><strong>Due day:</strong> {bill.dueDay}</div>
                              <div><strong>Next due:</strong> {formatLongDate(bill.dueDate)}</div>
                            </div>

                            <p style={{ fontSize: "14px", color: "#64748b", marginTop: "8px" }}>
                              {bill.isPaid
                                ? `Marked paid for cycle starting ${formatLongDate(cycleStart)}.`
                                : bill.dueInDays < 0
                                ? `${Math.abs(bill.dueInDays)} day(s) overdue.`
                                : bill.dueInDays === 0
                                ? "Due today."
                                : `Due in ${bill.dueInDays} day(s).`}
                            </p>
                          </div>

                          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
                            <button
                              style={buttonStyle(true)}
                              onClick={() => togglePaid(bill.id)}
                            >
                              {bill.isPaid ? "Mark Unpaid" : "Mark Paid"}
                            </button>

                            <button
                              style={buttonStyle(false)}
                              onClick={() => startEditBill(bill)}
                            >
                              Edit
                            </button>

                            <button
                              style={buttonStyle(false)}
                              onClick={() => deleteBill(bill.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div style={cardStyle()}>
              <h2 style={{ marginTop: 0 }}>Due soon</h2>

              {dueSoon.length === 0 ? (
                <p style={{ color: "#64748b" }}>No unpaid bills due in the next 3 days.</p>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {dueSoon.map((bill) => (
                    <div
                      key={bill.id}
                      style={{
                        background: "#fef3c7",
                        color: "#92400e",
                        padding: "14px",
                        borderRadius: "14px",
                      }}
                    >
                      <strong>{bill.name}</strong> for {currency(bill.amount)} is{" "}
                      {bill.dueInDays === 0
                        ? "due today"
                        : bill.dueInDays === 1
                        ? "due tomorrow"
                        : `due in ${bill.dueInDays} days`}
                      .
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
