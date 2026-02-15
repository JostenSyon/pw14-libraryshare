// public/js/views/loans.view.js
import { loadViewHtml } from "./viewLoader.js";
import { renderBookTile } from "../components/bookTile.js";

export async function renderLoansPage() {
  return loadViewHtml("/views/loans.html");
}

export function mountLoansPage(ctx) {
  const { api, $, escapeHtml, openBookModal } = ctx;

  const inboxCount = $("#inboxCount");
  const outboxCount = $("#outboxCount");
  const inboxStatus = $("#inboxStatus");
  const outboxStatus = $("#outboxStatus");
  const inboxList = $("#inboxList");
  const outboxList = $("#outboxList");

  const setText = (el, txt) => {
    if (el) el.textContent = txt || "";
  };


  const badgeForStatus = (status) => {
    const s = String(status || "").toLowerCase();
    if (s === "pending") return { text: "In attesa", cls: "badge badge--no" };
    if (s === "accepted") return { text: "Accettato", cls: "badge badge--ok" };
    if (s === "returned") return { text: "Restituito", cls: "badge badge--ok" };
    if (s === "rejected") return { text: "Rifiutato", cls: "badge badge--no" };
    if (s === "canceled" || s === "cancelled") return { text: "Annullato", cls: "badge badge--no" };
    return { text: s || "—", cls: "badge badge--no" };
  };

  const fmtDate = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return String(iso);
    }
  };

  const renderLoanCard = ({ kind, loan }) => {
    const id = loan?.id;
    const status = loan?.status;
    const isbn = loan?.book_isbn || loan?.isbn;
    const created = loan?.created_at;
    const bookTitle = loan?.book_title;
    const coverUrl = loan?.cover_url;

    const badge = badgeForStatus(status);

    const requester = loan?.requester_username || loan?.requester || loan?.requester_user_id;
    const owner = loan?.owner_username || loan?.owner || loan?.owner_user_id;

    const titleLine = bookTitle ? String(bookTitle) : `Prestito libro ${isbn || "—"}`;

    const s = String(status || "").toLowerCase();
    const detailsAction = { label: "Dettagli", action: "details", className: "btn btn--ghost", attrs: { "data-isbn": isbn || "" } };
    const actions = [];

    if (kind === "inbox") {
      if (s === "pending") {
        actions.push(
          { label: "Accetta", action: "accept", className: "btn btn--primary", attrs: { "data-id": id } },
          { label: "Rifiuta", action: "reject", className: "btn btn--ghost", attrs: { "data-id": id } }
        );
      } else if (s === "accepted") {
        actions.push({
          label: "Segna restituito",
          action: "return",
          className: "btn btn--primary",
          attrs: { "data-id": id },
        });
      }
    } else {
      if (s === "pending") {
        actions.push({
          label: "Annulla",
          action: "cancel",
          className: "btn btn--ghost",
          attrs: { "data-id": id },
        });
      }
    }

    return renderBookTile({
      context: kind === "inbox" ? "loans-inbox" : "loans-outbox",
      layout: "loan",
      isbn,
      title: titleLine,
      coverUrl,
      sideStatusLabel: badge.text,
      sideStatusTone: badge.cls.includes("badge--ok") ? "ok" : "no",
      requesterLabel: kind === "inbox" ? `Richiedente: ${requester || "—"}` : "",
      ownerLabel: kind === "outbox" ? `Proprietario: ${owner || "—"}` : "",
      loanMetaLabel: `Creato: ${fmtDate(created) || "—"}`,
      contactLabel: loan?.other_party_contact
        ? `${String(loan.other_party_contact)}${loan?.other_party_contact_type ? ` (${String(loan.other_party_contact_type)})` : ""}`
        : "",
      sideAction: detailsAction,
      actions,
      escapeHtml,
    });
  };

  const renderList = async (kind, loans) => {
    const listEl = kind === "inbox" ? inboxList : outboxList;
    const countEl = kind === "inbox" ? inboxCount : outboxCount;
    const statusEl = kind === "inbox" ? inboxStatus : outboxStatus;

    const arr = Array.isArray(loans) ? loans : [];
    setText(countEl, String(arr.length));

    if (!listEl) return;

    if (!arr.length) {
      listEl.innerHTML = "";
      setText(statusEl, kind === "inbox" ? "Nessuna richiesta ricevuta." : "Nessuna richiesta inviata.");
      return;
    }

    setText(statusEl, "");

    listEl.innerHTML = arr.map((loan) => renderLoanCard({ kind, loan })).join("");
  };

  const loadAll = async () => {
    setText(inboxStatus, "Caricamento…");
    setText(outboxStatus, "Caricamento…");

    try {
      if (!api.loans?.inbox) throw new Error("API loans.inbox non trovata");
      const inbox = await api.loans.inbox();
      await renderList("inbox", inbox);
    } catch (err) {
      console.warn("inbox load failed:", err);
      setText(inboxStatus, err?.message || "Errore nel caricamento inbox");
      inboxList && (inboxList.innerHTML = "");
      setText(inboxCount, "0");
    }

    try {
      if (!api.loans?.outbox) throw new Error("API loans.outbox non trovata");
      const outbox = await api.loans.outbox();
      await renderList("outbox", outbox);
    } catch (err) {
      console.warn("outbox load failed:", err);
      setText(outboxStatus, err?.message || "Errore nel caricamento outbox");
      outboxList && (outboxList.innerHTML = "");
      setText(outboxCount, "0");
    }
  };

  const runAction = async (action, id) => {
    if (!id) return;

    try {
      if (!api.loans) throw new Error("API loans non trovata");

      if (action === "accept") {
        await api.loans.accept(id);
      } else if (action === "reject") {
        await api.loans.reject(id);
      } else if (action === "return") {
        await api.loans.returnLoan(id);
      } else if (action === "cancel") {
        await api.loans.cancel(id);
      } else {
        return;
      }

      await loadAll();
    } catch (err) {
      alert(err?.message || "Errore nell'operazione");
    }
  };

  const handleClick = (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "details") {
      const isbn = btn.dataset.isbn;
      if (!isbn) return;
      if (!openBookModal) {
        console.warn("openBookModal missing from ctx");
        return;
      }
      openBookModal({ isbn, context: "loans" });
      return;
    }

    const id = btn.dataset.id;
    runAction(action, id);
  };

  inboxList?.addEventListener("click", handleClick);
  outboxList?.addEventListener("click", handleClick);

  loadAll();
}
