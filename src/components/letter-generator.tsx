"use client";

import { FileText, Lock, Printer, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { formatCitation, type CitationInput } from "@/lib/citation";
import { Button } from "./ui";

export interface LetterEvidence extends CitationInput {
  id: string;
  designLabel: string;
}

interface Props {
  drug: string;
  condition?: string;
  approval: "approved" | "off-label" | "unknown";
  gradeLabel: string;
  evidence: LetterEvidence[];
}

const EMPTY = {
  patientName: "",
  dob: "",
  memberId: "",
  groupNumber: "",
  insurer: "",
  diagnosis: "",
  icd10: "",
  dose: "",
  history: "",
  priorTreatments: "",
  urgent: false,
  physicianName: "",
  credentials: "MD",
  specialty: "",
  npi: "",
  practice: "",
  phone: "",
  fax: "",
};

type Fields = typeof EMPTY;

export function buildLetter(f: Fields, p: Props, selected: LetterEvidence[], today: string): string {
  const drug = p.drug.charAt(0).toUpperCase() + p.drug.slice(1);
  const diagnosis = f.diagnosis || p.condition || "[diagnosis]";
  const name = f.patientName || "[patient name]";
  const lines = [
    today,
    "",
    f.insurer || "[insurance company]",
    "Attn: Medical Director, Utilization Review",
    "",
    "RE: Letter of Medical Necessity",
    `Patient: ${name}    Date of birth: ${f.dob || "[DOB]"}`,
    `Member ID: ${f.memberId || "[member ID]"}${f.groupNumber ? `    Group number: ${f.groupNumber}` : ""}`,
    `Requested treatment: ${drug}${f.dose ? `, ${f.dose}` : ""}`,
    `Diagnosis: ${diagnosis}${f.icd10 ? ` (ICD-10 ${f.icd10})` : ""}`,
    "",
    "Dear Medical Director,",
    "",
    `I am writing on behalf of my patient, ${name}, to request coverage of ${drug}${f.dose ? ` (${f.dose})` : ""} for the treatment of ${diagnosis}.` +
      (f.urgent
        ? " Because a delay in treatment could seriously jeopardize my patient's health, I request an expedited review."
        : ""),
    "",
    "Clinical history",
    f.history || "[Summarize the diagnosis, severity, relevant test results and how the condition affects the patient.]",
    "",
    "Previous treatments",
    f.priorTreatments || "[List treatments tried, with dates, doses and why they were stopped: ineffective, not tolerated or contraindicated.]",
    "",
    "Medical rationale",
    p.approval === "off-label"
      ? `${drug} is not FDA-approved for ${diagnosis}. Its use for this condition is supported by peer-reviewed medical literature, listed below. Prescribing a drug off-label when it is supported by published evidence is an accepted part of medical practice.`
      : p.approval === "approved"
        ? `${drug} is FDA-approved for this indication, as stated in its prescribing information.`
        : `${drug} is supported for this use by the peer-reviewed medical literature listed below.`,
    selected.length > 0
      ? `Using the GRADE approach, the certainty of the published evidence for ${drug} in ${diagnosis} is rated ${p.gradeLabel.toLowerCase()}.`
      : "",
    `In my clinical judgement, ${drug} is medically necessary for this patient, and the alternatives listed above are not appropriate.`,
    "",
    ...(selected.length > 0
      ? ["Supporting evidence", ...selected.map((e, i) => `${i + 1}. ${formatCitation(e)}`), ""]
      : []),
    `Please contact me${f.phone ? ` at ${f.phone}` : ""} if you need more information. Thank you for your prompt review.`,
    "",
    "Sincerely,",
    "",
    "",
    `${f.physicianName || "[physician name]"}${f.credentials ? `, ${f.credentials}` : ""}`,
    f.specialty,
    f.npi ? `NPI: ${f.npi}` : "NPI: [NPI]",
    f.practice,
    [f.phone && `Phone: ${f.phone}`, f.fax && `Fax: ${f.fax}`].filter(Boolean).join("    "),
  ];
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}

function Field({
  label,
  name,
  value,
  onChange,
  textarea,
  hint,
}: {
  label: string;
  name: keyof Fields;
  value: string;
  onChange: (name: keyof Fields, value: string) => void;
  textarea?: boolean;
  hint?: string;
}) {
  const id = useId();
  const cls = "w-full rounded-md border border-[#cbbd9f] bg-surface px-3 py-2 text-ink focus:border-navy";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-medium">
        {label}
        {hint && <span className="font-normal text-muted"> ({hint})</span>}
      </label>
      {textarea ? (
        <textarea id={id} rows={3} className={cls} value={value} onChange={(e) => onChange(name, e.target.value)} />
      ) : (
        <input id={id} autoComplete="off" className={cls} value={value} onChange={(e) => onChange(name, e.target.value)} />
      )}
    </div>
  );
}

/**
 * Medical necessity letter, pre-filled with the drug, approval status and top evidence.
 * Patient details live only in this component's state: never saved, sent or logged.
 */
export function LetterGenerator(props: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fields, setFields] = useState<Fields>({ ...EMPTY, diagnosis: props.condition ?? "" });
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(props.evidence.filter((e) => e.peerReviewed).slice(0, 5).map((e) => e.id)),
  );
  const [letter, setLetter] = useState("");

  const set = (name: keyof Fields, value: string | boolean) => setFields((f) => ({ ...f, [name]: value }));

  function generate(e: React.FormEvent) {
    e.preventDefault();
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    setLetter(buildLetter(fields, props, props.evidence.filter((ev) => chosen.has(ev.id)), today));
  }

  function clearAll() {
    setFields({ ...EMPTY, diagnosis: props.condition ?? "" });
    setLetter("");
  }

  function print() {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const doc = w.document;
    doc.title = "Letter of medical necessity";
    const pre = doc.createElement("pre");
    pre.textContent = letter;
    pre.style.cssText = "white-space:pre-wrap;font:12pt/1.5 Georgia,serif;margin:1in;";
    doc.body.appendChild(pre);
    w.focus();
    w.print();
  }

  return (
    <>
      <Button onClick={() => dialogRef.current?.showModal()}>
        <FileText aria-hidden className="size-4" /> Generate letter
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="letter-title"
        className="m-auto w-[min(56rem,calc(100vw-1rem))] max-h-[calc(100vh-1rem)] rounded-xl border border-line bg-cream p-0 text-ink backdrop:bg-black/40"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
          <h2 id="letter-title" className="text-xl font-semibold">
            Letter of medical necessity
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md p-2 hover:bg-[#f1ebe0]"
            aria-label="Close letter tool"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <p className="flex items-start gap-2 rounded-lg border border-[#a9d8bb] bg-[#eef8f1] px-3 py-2 text-[#1d5b36]">
            <Lock aria-hidden className="mt-1 size-4 shrink-0" />
            Patient details stay in this browser tab. They are not saved, and they are never sent to Vynthera&apos;s servers or to
            any AI service. Closing the tab erases them.
          </p>
          <form onSubmit={generate} className="space-y-5">
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-lg font-semibold">Patient and insurer</legend>
              <Field label="Patient name" name="patientName" value={fields.patientName} onChange={set} />
              <Field label="Date of birth" name="dob" value={fields.dob} onChange={set} />
              <Field label="Insurance company" name="insurer" value={fields.insurer} onChange={set} />
              <Field label="Member ID" name="memberId" value={fields.memberId} onChange={set} />
              <Field label="Group number" name="groupNumber" value={fields.groupNumber} onChange={set} hint="optional" />
              <Field label="Diagnosis" name="diagnosis" value={fields.diagnosis} onChange={set} />
              <Field label="ICD-10 code" name="icd10" value={fields.icd10} onChange={set} />
              <Field label="Dose, route and frequency" name="dose" value={fields.dose} onChange={set} hint="e.g. 500 mg orally twice daily" />
            </fieldset>
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-lg font-semibold">Clinical details</legend>
              <Field label="Clinical history" name="history" value={fields.history} onChange={set} textarea />
              <Field label="Previous treatments and outcomes" name="priorTreatments" value={fields.priorTreatments} onChange={set} textarea />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={fields.urgent} onChange={(e) => set("urgent", e.target.checked)} className="size-4" />
                Request an expedited (urgent) review
              </label>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-lg font-semibold">Prescribing physician</legend>
              <Field label="Name" name="physicianName" value={fields.physicianName} onChange={set} />
              <Field label="Credentials" name="credentials" value={fields.credentials} onChange={set} />
              <Field label="Specialty" name="specialty" value={fields.specialty} onChange={set} />
              <Field label="NPI" name="npi" value={fields.npi} onChange={set} />
              <Field label="Practice name and address" name="practice" value={fields.practice} onChange={set} />
              <Field label="Phone" name="phone" value={fields.phone} onChange={set} />
              <Field label="Fax" name="fax" value={fields.fax} onChange={set} />
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-lg font-semibold">Evidence to cite</legend>
              {props.evidence.length === 0 ? (
                <p className="text-muted">No studies were found to cite.</p>
              ) : (
                <ul className="space-y-2">
                  {props.evidence.map((e) => (
                    <li key={e.id}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1.5 size-4 shrink-0"
                          checked={chosen.has(e.id)}
                          onChange={(ev) =>
                            setChosen((prev) => {
                              const next = new Set(prev);
                              if (ev.target.checked) next.add(e.id);
                              else next.delete(e.id);
                              return next;
                            })
                          }
                        />
                        <span>
                          <span className="font-medium">{e.designLabel}:</span> {e.title} ({e.year})
                          {!e.peerReviewed && <span className="text-[#4b2a7a]"> · preprint</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">
                <FileText aria-hidden className="size-4" /> Create letter
              </Button>
              <Button type="button" variant="ghost" onClick={clearAll}>
                Clear all fields
              </Button>
            </div>
          </form>
          {letter && (
            <section aria-labelledby="letter-preview" className="space-y-3">
              <h3 id="letter-preview" className="text-lg font-semibold">
                Your letter
              </h3>
              <p className="text-muted">Review and edit before sending. You are responsible for its accuracy.</p>
              <textarea
                aria-label="Letter text"
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                rows={22}
                className="w-full rounded-md border border-[#cbbd9f] bg-surface p-4 font-serif text-[1.05rem] leading-relaxed"
              />
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={print}>
                  <Printer aria-hidden className="size-4" /> Print
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigator.clipboard.writeText(letter)}>
                  Copy text
                </Button>
              </div>
            </section>
          )}
        </div>
      </dialog>
    </>
  );
}
