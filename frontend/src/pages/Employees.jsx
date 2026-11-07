import { useCallback, useEffect, useState } from "react";

const API = "http://localhost:5000/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SHIFTS = {
  morning: { label: "Morning", hours: "07:00 - 15:00", start: "07:00", end: "15:00" },
  afternoon: { label: "Afternoon", hours: "11:00 - 19:00", start: "11:00", end: "19:00" },
  evening: { label: "Evening", hours: "15:00 - 23:00", start: "15:00", end: "23:00" },
  off: { label: "Day off", hours: "" },
  leave: { label: "Leave", hours: "" },
};

const WORKING = ["morning", "afternoon", "evening"];
const GRADES = ["Manager", "Head barista", "Barista", "Waiter", "Cashier", "Trainee"];
const STATUSES = ["Active", "On leave", "Absent"];

const EMPTY_FORM = {
  name: "",
  email: "",
  grade: "Barista",
  status: "Active",
  remark: "",
};

const EMPTY_EMAIL = { subject: "", body: "" };

function statusClass(status = "Active") {
  return "emp-status emp-status--" +
    status.toLowerCase().replaceAll(" ", "-");
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Get Monday of the current week.
function getMonday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function getWeekDates() {
  const monday = getMonday();

  return DAYS.map((_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return dateKey(date);
  });
}

function getFullName(employee) {
  return `${employee.first_name || ""} ${employee.last_name || ""}`.trim();
}

function getInitials(employee) {
  const first = (employee.first_name || "").charAt(0);
  const last = (employee.last_name || "").charAt(0);
  return (first + last).toUpperCase() || "?";
}

function mapStatus(status) {
  if (status === "inactive") return "Absent";
  return "Active";
}

export default function Employees() {
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [weekDates, setWeekDates] = useState(getWeekDates);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  // selection + email
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState(EMPTY_EMAIL);
  const [sending, setSending] = useState(false);

  // profile window
  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || `Request failed (${response.status})`);
    }

    return data;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const dates = getWeekDates();
      setWeekDates(dates);

      const [employeeData, shiftData] = await Promise.all([
        request("/employees"),
        request(`/shifts?from=${dates[0]}&to=${dates[6]}`),
      ]);

      setStaff(Array.isArray(employeeData) ? employeeData : employeeData.employees || []);
      setShifts(Array.isArray(shiftData) ? shiftData : shiftData.shifts || []);
    } catch (err) {
      setError(
        `Could not load employees or schedules. Check that the backend is running. ${err.message}`
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Close the profile window with the Escape key.
  useEffect(() => {
    if (!profile) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setProfile(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profile]);

  /* ---------- selection ---------- */

  // Only employees that still exist and have an email can receive a message.
  const selectedStaff = staff.filter((e) => selectedIds.includes(e.employee_id));
  const recipients = selectedStaff.filter((e) => e.email);
  const allSelected = staff.length > 0 && selectedStaff.length === staff.length;

  function toggleSelect(id) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : staff.map((e) => e.employee_id));
  }

  function clearSelection() {
    setSelectedIds([]);
    setEmailOpen(false);
  }

  /* ---------- email ---------- */

  function openEmail() {
    setError("");
    setMessage("");
    setEmailOpen(true);
  }

  function emailOne(employee) {
    setSelectedIds([employee.employee_id]);
    setProfile(null);
    openEmail();
  }

  function handleEmailChange(event) {
    setEmailForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function sendEmail(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (recipients.length === 0) {
      setError("Select at least one employee who has an email address.");
      return;
    }
    if (!emailForm.subject.trim() || !emailForm.body.trim()) {
      setError("Please write a subject and a message.");
      return;
    }
    if (
      recipients.length > 1 &&
      !window.confirm(`Send this email to ${recipients.length} employees?`)
    ) {
      return;
    }

    setSending(true);

    try {
      const result = await request("/emails/send", {
        method: "POST",
        body: JSON.stringify({
          recipients: recipients.map((e) => ({
            employee_id: e.employee_id,
            name: getFullName(e),
            email: e.email,
          })),
          subject: emailForm.subject.trim(),
          message: emailForm.body.trim(),
        }),
      });

      const sent = result.sent ?? recipients.length;
      const failed = result.failed ?? 0;
      setMessage(
        failed > 0
          ? `Email sent to ${sent} employee(s). ${failed} failed.`
          : `Email sent to ${sent} employee(s).`
      );
      setEmailForm(EMPTY_EMAIL);
      setEmailOpen(false);
      setSelectedIds([]);
    } catch (err) {
      setError(`Could not send the email. ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  /* ---------- staff form ---------- */

  function handleFormChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const parts = form.name.trim().split(/\s+/);
    const firstName = parts.shift();
    const lastName = parts.join(" ");

    if (!firstName) {
      setError("Please enter the employee's name.");
      return;
    }

    if (!form.email.trim()) {
      setError("Please enter an email address for the employee.");
      return;
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      email: form.email.trim(),
      job_title: form.grade,
      status: form.status === "Absent" ? "inactive" : "active",
      remark: form.remark.trim(),
    };

    setSaving(true);

    try {
      if (editingId === null) {
        await request("/employees", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Employee added successfully.");
      } else {
        await request(`/employees/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("Employee updated successfully.");
      }

      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(employee) {
    setEditingId(employee.employee_id);
    setForm({
      name: getFullName(employee),
      email: employee.email || "",
      grade: employee.job_title || "Barista",
      status: mapStatus(employee.status),
      remark: employee.remark || "",
    });
    setError("");
    setMessage("");
    setProfile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setMessage("");
  }

  async function deleteEmployee(employee) {
    const name = getFullName(employee);

    if (!window.confirm(`Delete ${name} and their associated records?`)) return;

    setError("");
    setMessage("");

    try {
      await request(`/employees/${employee.employee_id}`, {
        method: "DELETE",
      });
      setMessage("Employee deleted successfully.");
      setSelectedIds((current) => current.filter((id) => id !== employee.employee_id));
      setProfile(null);

      if (editingId === employee.employee_id) {
        cancelEdit();
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  /* ---------- schedule ---------- */

  function findShift(employeeId, date) {
    return shifts.find((shift) => {
      const shiftDate = new Date(shift.shift_date);

      // Compare calendar dates in the local timezone.
      const localDate = [
        shiftDate.getFullYear(),
        String(shiftDate.getMonth() + 1).padStart(2, "0"),
        String(shiftDate.getDate()).padStart(2, "0"),
      ].join("-");

      return (
        Number(shift.employee_id) === Number(employeeId) &&
        localDate === date
      );
    });
  }

  function getShiftType(shift) {
    if (!shift) return "off";

    const start = String(shift.start_time).slice(0, 5);
    const end = String(shift.end_time).slice(0, 5);

    return (
      Object.keys(SHIFTS).find((key) => {
        const item = SHIFTS[key];
        return item.start === start && item.end === end;
      }) || "morning"
    );
  }

  async function setShift(employee, dayIndex, value) {
    const date = weekDates[dayIndex];
    const existing = findShift(employee.employee_id, date);

    setError("");
    setMessage("");

    try {
      if (value === "off" || value === "leave") {
        if (existing) {
          await request(`/shifts/${existing.shift_id}`, {
            method: "DELETE",
          });
        }

        if (value === "leave") {
          setMessage(
            "Shift removed. To record official leave, create an absence record in the Absences API."
          );
        } else {
          setMessage("Day off saved.");
        }
      } else {
        const selected = SHIFTS[value];

        const payload = {
          employee_id: employee.employee_id,
          shift_date: date,
          start_time: selected.start,
          end_time: selected.end,
          role: employee.job_title || "Employee",
          notes: "",
        };

        if (existing) {
          await request(`/shifts/${existing.shift_id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } else {
          await request("/shifts", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }

        setMessage(`${selected.label} shift saved for ${getFullName(employee)}.`);
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function coverage(dayIndex) {
    const date = weekDates[dayIndex];

    return staff.filter((employee) => {
      const shift = findShift(employee.employee_id, date);
      return Boolean(shift) && WORKING.includes(getShiftType(shift));
    }).length;
  }

  return (
    <div className="emp-page">
      <header className="emp-header">
        <h1 className="emp-title">Employees</h1>
        <p className="emp-note">
          Employee records and schedules are saved in the database.
        </p>
      </header>

      {error && <p className="emp-error" role="alert">{error}</p>}
      {message && <p className="emp-success" role="status">{message}</p>}

      {/* ============ STAFF LIST ============ */}
      <section className="emp-section">
        <h2 className="emp-section-title">Staff list</h2>

        <form className="emp-form" onSubmit={handleSubmit}>
          <input
            className="emp-field"
            name="name"
            placeholder="Full name"
            value={form.name}
            onChange={handleFormChange}
            required
          />

          <input
            className="emp-field"
            type="email"
            name="email"
            placeholder="Email address"
            value={form.email}
            onChange={handleFormChange}
            required
          />

          <select
            className="emp-field"
            name="grade"
            value={form.grade}
            onChange={handleFormChange}
          >
            {GRADES.map((grade) => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>

          <select
            className="emp-field"
            name="status"
            value={form.status}
            onChange={handleFormChange}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <input
            className="emp-field emp-field--wide"
            name="remark"
            placeholder="Remark (optional)"
            value={form.remark}
            onChange={handleFormChange}
          />

          <button
            className="emp-btn emp-btn--primary"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving..."
              : editingId === null
                ? "Add employee"
                : "Save changes"}
          </button>

          {editingId !== null && (
            <button className="emp-btn" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </form>

        {/* ---------- selection bar ---------- */}
        <div className="emp-selection-bar">
          <span className="emp-selection-count">
            {selectedStaff.length === 0
              ? "No employee selected"
              : `${selectedStaff.length} selected`}
          </span>

          <div className="emp-selection-actions">
            <button className="emp-btn emp-btn--small" type="button" onClick={toggleAll} disabled={staff.length === 0}>
              {allSelected ? "Unselect all" : "Select all"}
            </button>
            {selectedStaff.length > 0 && (
              <button className="emp-btn emp-btn--small" type="button" onClick={clearSelection}>
                Clear
              </button>
            )}
            <button
              className="emp-btn emp-btn--small emp-btn--primary"
              type="button"
              onClick={openEmail}
              disabled={selectedStaff.length === 0}
            >
              Send email
            </button>
          </div>
        </div>

        {/* ---------- email composer ---------- */}
        {emailOpen && (
          <form className="emp-email" onSubmit={sendEmail}>
            <h3 className="emp-email-title">New email</h3>

            <p className="emp-email-to">
              <strong>To ({recipients.length}):</strong>{" "}
              {recipients.map((e) => getFullName(e)).join(", ") || "nobody"}
            </p>
            {recipients.length < selectedStaff.length && (
              <p className="emp-email-warning">
                {selectedStaff.length - recipients.length} selected employee(s) have no email and will be skipped.
              </p>
            )}
            <p className="emp-hint">
              Each employee receives their own copy. They cannot see the other recipients.
            </p>

            <input
              className="emp-field emp-email-field"
              name="subject"
              placeholder="Subject"
              value={emailForm.subject}
              onChange={handleEmailChange}
              maxLength={150}
            />
            <textarea
              className="emp-field emp-email-field emp-email-body"
              name="body"
              placeholder="Write your message here..."
              rows={6}
              value={emailForm.body}
              onChange={handleEmailChange}
            />

            <div className="emp-email-actions">
              <button className="emp-btn emp-btn--primary" type="submit" disabled={sending}>
                {sending ? "Sending..." : `Send to ${recipients.length}`}
              </button>
              <button className="emp-btn" type="button" onClick={() => setEmailOpen(false)} disabled={sending}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="emp-scroll">
          <table className="emp-table">
            <thead>
              <tr>
                <th className="emp-check-col">
                  <input
                    type="checkbox"
                    aria-label="Select all employees"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={staff.length === 0}
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Grade</th>
                <th>Status</th>
                <th>Remark</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="emp-empty">Loading employees...</td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan="7" className="emp-empty">
                    No employees yet. Add the first one above.
                  </td>
                </tr>
              ) : (
                staff.map((employee) => {
                  const checked = selectedIds.includes(employee.employee_id);
                  return (
                    <tr
                      key={employee.employee_id}
                      className={checked ? "emp-row--selected" : ""}
                    >
                      <td className="emp-check-col">
                        <input
                          type="checkbox"
                          aria-label={`Select ${getFullName(employee)}`}
                          checked={checked}
                          onChange={() => toggleSelect(employee.employee_id)}
                        />
                      </td>
                      <td className="emp-name">
                        <button
                          type="button"
                          className="emp-name-button"
                          onClick={() => setProfile(employee)}
                        >
                          {getFullName(employee)}
                        </button>
                      </td>
                      <td>{employee.email || "-"}</td>
                      <td>{employee.job_title || "-"}</td>
                      <td>
                        <span className={statusClass(mapStatus(employee.status))}>
                          {mapStatus(employee.status)}
                        </span>
                      </td>
                      <td className="emp-remark">{employee.remark || "-"}</td>
                      <td className="emp-actions">
                        <button
                          className="emp-btn emp-btn--small"
                          type="button"
                          onClick={() => setProfile(employee)}
                        >
                          Profile
                        </button>

                        <button
                          className="emp-btn emp-btn--small"
                          type="button"
                          onClick={() => startEdit(employee)}
                        >
                          Edit
                        </button>

                        <button
                          className="emp-btn emp-btn--small emp-btn--danger"
                          type="button"
                          onClick={() => deleteEmployee(employee)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ WEEKLY SCHEDULE ============ */}
      <section className="emp-section">
        <h2 className="emp-section-title">Weekly schedule (emploi du temps)</h2>

        <ul className="emp-legend">
          {Object.entries(SHIFTS).map(([key, shift]) => (
            <li key={key} className={`emp-legend-item emp-shift--${key}`}>
              <strong>{shift.label}</strong>
              {shift.hours && <span>{shift.hours}</span>}
            </li>
          ))}
        </ul>

        <div className="emp-scroll">
          <table className="emp-table emp-schedule">
            <thead>
              <tr>
                <th>Employee</th>
                {DAYS.map((day, index) => (
                  <th key={day}>
                    {day}
                    <small style={{ display: "block" }}>
                      {weekDates[index]?.slice(5)}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {staff.map((employee) => (
                <tr key={employee.employee_id}>
                  <td className="emp-name">
                    {getFullName(employee)}
                    <small className="emp-grade">
                      {employee.job_title || "Employee"}
                    </small>
                  </td>

                  {DAYS.map((day, index) => {
                    const shift = findShift(employee.employee_id, weekDates[index]);
                    const value = getShiftType(shift);

                    return (
                      <td key={day}>
                        <select
                          className={`emp-shift emp-shift--${value}`}
                          value={value}
                          aria-label={`${getFullName(employee)}, ${day}`}
                          disabled={loading}
                          onChange={(event) =>
                            setShift(employee, index, event.target.value)
                          }
                        >
                          {Object.entries(SHIFTS).map(([key, item]) => (
                            <option key={key} value={key}>{item.label}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td className="emp-name">People working</td>
                {DAYS.map((day, index) => {
                  const count = coverage(index);
                  return (
                    <td
                      key={day}
                      className={count < 2 ? "emp-cover emp-cover--low" : "emp-cover"}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="emp-hint">
          A red count means fewer than 2 people are working that day.
          Changes to the schedule are saved to the database.
        </p>
      </section>

      {/* ============ PROFILE WINDOW ============ */}
      {profile && (
        <div className="emp-modal-overlay" onClick={() => setProfile(null)}>
          <div
            className="emp-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Profile of ${getFullName(profile)}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="emp-modal-close"
              aria-label="Close"
              onClick={() => setProfile(null)}
            >
              ×
            </button>

            <div className="emp-profile-head">
              <div className="emp-avatar">{getInitials(profile)}</div>
              <div>
                <h2 className="emp-profile-name">{getFullName(profile)}</h2>
                <p className="emp-profile-grade">{profile.job_title || "Employee"}</p>
                <span className={statusClass(mapStatus(profile.status))}>
                  {mapStatus(profile.status)}
                </span>
              </div>
            </div>

            <dl className="emp-profile-info">
              <dt>Email</dt>
              <dd>{profile.email || "-"}</dd>
              <dt>Remark</dt>
              <dd>{profile.remark || "-"}</dd>
            </dl>

            <h3 className="emp-profile-subtitle">This week</h3>
            <ul className="emp-profile-week">
              {DAYS.map((day, index) => {
                const type = getShiftType(findShift(profile.employee_id, weekDates[index]));
                return (
                  <li key={day} className={`emp-profile-day emp-shift--${type}`}>
                    <strong>{day}</strong>
                    <span>{SHIFTS[type].label}</span>
                    {SHIFTS[type].hours && <small>{SHIFTS[type].hours}</small>}
                  </li>
                );
              })}
            </ul>

            <div className="emp-modal-actions">
              <button
                className="emp-btn emp-btn--primary"
                type="button"
                onClick={() => emailOne(profile)}
                disabled={!profile.email}
              >
                Send email
              </button>
              <button className="emp-btn" type="button" onClick={() => startEdit(profile)}>
                Edit
              </button>
              <button className="emp-btn" type="button" onClick={() => setProfile(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
