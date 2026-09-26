const components = [
  {
    title: "Fixed assessment",
    source: "The building's monthly operating budget and each unit's participation percentage.",
    formula: "Monthly budget x unit participation percentage = fixed assessment",
    month: "The obligation month. A plan for that year is required.",
    missing: "Without a valid budget plan or participation percentage, the fixed component is unavailable.",
  },
  {
    title: "Metered Water",
    source: "A completed Water meter record for each applicable condo unit, including valid nonnegative consumption, plus the Sedapal/Common Water bill.",
    formula: "Unit consumption / total consumption x Sedapal bill = unit Water amount",
    month: "Readings from the source month feed the following obligation month.",
    missing: "Missing, incomplete, invalid, or negative readings block the Water component. A missing Sedapal bill also blocks Common Water.",
  },
  {
    title: "Common Water",
    source: "The Sedapal/Common Water bill and the total of the applicable unit Water readings.",
    formula: "Supplier bill amount allocated by unit consumption; the unallocated remainder is Common Water.",
    month: "The bill and readings belong to the source month immediately before the obligation month.",
    missing: "Without one valid bill and a complete valid reading set, Common Water cannot be calculated.",
  },
  {
    title: "Gas",
    source: "Gas readings for condo units enrolled in Gas service. Unenrolled condos, parking, and storage units do not participate.",
    formula: "Unit consumption x blended Gas rate = unit Gas obligation",
    month: "Gas readings from the source month feed the following obligation month.",
    missing: "Missing or nonnumeric readings for participating units block Gas. Supplier bills contribute to the available Gas cost pool when unprocessed, but their absence alone does not block readiness.",
  },
  {
    title: "Other charges",
    source: "Applicable unit charges and owner-direct charges.",
    formula: "Eligible charge amount -> added to the monthly obligation",
    month: "A charge applies when its schedule and effective dates include the obligation month.",
    missing: "No applicable charge is normal; it is not a blocker. A charge with invalid data is a calculation problem.",
  },
];

const journeyStates = [
  ["Building", "The next package is being assembled. Carlos sees the financial journey, not Giuliana's source checklist."],
  ["Ready", "The live financial facts are complete, but the package has not yet been handed to Carlos."],
  ["Blocked", "A required source input is missing or invalid. The blocker explains what needs attention."],
  ["Ready for your approval", "The package has been handed off and is ready for Carlos to review."],
  ["Approval overdue", "The package is still waiting for Carlos after its review point."],
  ["Approved", "Carlos approved the package. Its financial values are now frozen for that obligation month."],
];

function FlowStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-w-36 flex-1 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-700">{detail}</p>
    </div>
  );
}

export default function ObligationsHelpPage() {
  return (
    <article className="max-w-4xl space-y-16 pb-16">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-500">Help &amp; Documentation</p>
        <h1 className="text-5xl font-semibold tracking-tight text-zinc-950 sm:text-6xl">Obligations</h1>
        <p className="max-w-2xl text-xl leading-8 text-zinc-600">
          How TB810 turns monthly source information into the amount each owner or unit is expected to pay.
        </p>
      </header>

      <section className="space-y-5" aria-labelledby="what-is-an-obligation">
        <h2 id="what-is-an-obligation" className="text-2xl font-semibold tracking-tight text-zinc-950">What is an obligation?</h2>
        <p className="max-w-3xl text-lg leading-8 text-zinc-700">
          An obligation is the complete amount calculated for one owner or unit for a particular month. It brings together fixed assessment, consumption-based components, and applicable charges so the building has one traceable monthly financial package.
        </p>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-700">
          <span className="font-semibold text-zinc-950">Operationally:</span> Giuliana prepares and maintains source information. TB810 calculates the package and coordinates the handoff. Carlos reviews the resulting financial package and approves it. Invoice generation is the intended downstream stage; it is not part of the current approval calculation.
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
          <p className="font-semibold text-zinc-950">Historical obligations</p>
          <p className="mt-2">TB810 began tracking monthly obligations in September 2026. Records from earlier months remain available as historical financial and consumption data, but they do not contain monthly obligation packages. TB810 does not retroactively create obligations for these earlier periods.</p>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="monthly-flow">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">The monthly flow</p>
          <h2 id="monthly-flow" className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">From source information to approval</h2>
        </div>
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          <FlowStep title="Source data" detail="Readings, bills, budget, and applicable charges" />
          <span className="hidden text-xl text-zinc-400 md:block" aria-hidden="true">-&gt;</span>
          <FlowStep title="Building" detail="TB810 assembles the monthly financial facts" />
          <span className="hidden text-xl text-zinc-400 md:block" aria-hidden="true">-&gt;</span>
          <FlowStep title="Ready or blocked" detail="Required inputs determine financial readiness" />
          <span className="hidden text-xl text-zinc-400 md:block" aria-hidden="true">-&gt;</span>
          <FlowStep title="Carlos review" detail="The handed-off package is reviewed" />
          <span className="hidden text-xl text-zinc-400 md:block" aria-hidden="true">-&gt;</span>
          <FlowStep title="Approved" detail="The monthly financial record is frozen" />
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="composition">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">The calculation</p>
          <h2 id="composition" className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">How an obligation is built</h2>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-8">
          <div className="mx-auto max-w-xs rounded-2xl bg-zinc-950 p-5 text-center text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Monthly obligation</p>
            <p className="mt-2 text-xl font-semibold">Total due</p>
          </div>
          <div className="mx-auto h-8 w-px bg-zinc-300" aria-hidden="true" />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 p-5"><p className="font-semibold text-zinc-950">Fixed</p><p className="mt-2 text-sm leading-6 text-zinc-600">Assessment allocated from the building budget.</p></div>
            <div className="rounded-2xl border border-zinc-200 p-5"><p className="font-semibold text-zinc-950">Consumption</p><p className="mt-2 text-sm leading-6 text-zinc-600">Metered Water, Common Water, and Gas.</p></div>
            <div className="rounded-2xl border border-zinc-200 p-5"><p className="font-semibold text-zinc-950">Other charges</p><p className="mt-2 text-sm leading-6 text-zinc-600">Eligible unit and owner-direct charges.</p></div>
          </div>
          <div className="mx-auto mt-4 h-8 w-px bg-zinc-300" aria-hidden="true" />
          <p className="text-center text-sm font-medium text-zinc-600">Only available components contribute their amount to the known total.</p>
        </div>
      </section>

      <section className="space-y-8" aria-labelledby="components">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Component guide</p>
          <h2 id="components" className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Where each number comes from</h2>
        </div>
        <div className="space-y-5">
          {components.map((component) => (
            <section key={component.title} className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8">
              <h3 className="text-xl font-semibold text-zinc-950">{component.title}</h3>
              <div className="mt-6 grid gap-6 text-sm leading-6 sm:grid-cols-2">
                <div><p className="font-semibold uppercase tracking-[0.16em] text-zinc-500">Source data</p><p className="mt-2 text-zinc-700">{component.source}</p></div>
                <div><p className="font-semibold uppercase tracking-[0.16em] text-zinc-500">Calculation</p><p className="mt-2 rounded-xl bg-zinc-50 p-3 font-medium text-zinc-950">{component.formula}</p></div>
                <div><p className="font-semibold uppercase tracking-[0.16em] text-zinc-500">Month</p><p className="mt-2 text-zinc-700">{component.month}</p></div>
                <div><p className="font-semibold uppercase tracking-[0.16em] text-zinc-500">If missing</p><p className="mt-2 text-zinc-700">{component.missing}</p></div>
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="month-relationship">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Month relationship</p>
          <h2 id="month-relationship" className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Source month versus obligation month</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">September</p><p className="mt-2 font-semibold text-zinc-950">Readings and bills</p><p className="mt-2 text-sm text-zinc-600">The source month</p></div>
          <span className="text-2xl text-zinc-400" aria-hidden="true">-&gt;</span>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">October</p><p className="mt-2 font-semibold text-zinc-950">Obligation</p><p className="mt-2 text-sm text-zinc-600">The month being charged</p></div>
        </div>
        <p className="max-w-3xl text-lg leading-8 text-zinc-700">The obligation month is the month the owner or unit is charged. Water and Gas readings normally describe the immediately preceding source month, so September source information feeds October obligations.</p>
      </section>

      <section className="space-y-5" aria-labelledby="readiness">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Readiness</p>
          <h2 id="readiness" className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">When is an obligation ready?</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="font-semibold text-zinc-950">Required</p><p className="mt-2 text-sm leading-6 text-zinc-600">Budget, applicable Water readings, Sedapal/Common Water, and applicable Gas readings.</p></div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="font-semibold text-zinc-950">Optional</p><p className="mt-2 text-sm leading-6 text-zinc-600">Unit charges, owner-direct charges, and supplier bills when there is no bill to process.</p></div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="font-semibold text-zinc-950">Informational</p><p className="mt-2 text-sm leading-6 text-zinc-600">A source count or bill total can explain the package, but does not replace a required valid input.</p></div>
        </div>
        <p className="text-lg leading-8 text-zinc-700">If required information is missing or invalid, TB810 keeps the affected component unavailable or blocked and the package cannot be considered financially ready.</p>
      </section>

      <section className="space-y-5" aria-labelledby="change-boundary">
        <h2 id="change-boundary" className="text-2xl font-semibold tracking-tight text-zinc-950">When can the numbers change?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="font-semibold text-zinc-950">Before approval</p><p className="mt-2 text-sm leading-6 text-zinc-600">The package is live. Eligible corrections and newly available source information can change the calculated total before approval.</p></div>
          <div className="rounded-2xl border border-zinc-950 bg-zinc-950 p-5 text-white"><p className="font-semibold">After approval</p><p className="mt-2 text-sm leading-6 text-zinc-300">Carlos&apos;s approval creates the immutable financial snapshot for that obligation month. Later work must not silently recalculate that approved package from changing live facts.</p></div>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="journey">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">The journey</p>
          <h2 id="journey" className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Obligation states</h2>
        </div>
        <div className="divide-y divide-zinc-200 rounded-3xl border border-zinc-200 bg-white">
          {journeyStates.map(([title, description]) => <div key={title} className="grid gap-2 p-5 sm:grid-cols-[13rem_1fr] sm:gap-6"><p className="font-semibold text-zinc-950">{title}</p><p className="text-sm leading-6 text-zinc-600">{description}</p></div>)}
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="source-map">
        <h2 id="source-map" className="text-2xl font-semibold tracking-tight text-zinc-950">Source map</h2>
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-2 border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500"><span>Source</span><span>Contributes to</span></div>
          {[
            ["Building budget", "Fixed assessment"],
            ["Water readings", "Metered Water"],
            ["Sedapal bill", "Common Water and Water allocation"],
            ["Gas readings", "Gas consumption"],
            ["Applicable charges", "Other charges or owner-direct charges"],
          ].map(([source, contribution]) => <div key={source} className="grid grid-cols-2 border-b border-zinc-100 px-5 py-4 text-sm last:border-0"><span className="text-zinc-700">{source}</span><span className="font-medium text-zinc-950">{contribution}</span></div>)}
        </div>
        <p className="text-sm leading-6 text-zinc-500">If a number looks wrong, start with the source listed here for that component and check its month, completeness, and validity.</p>
      </section>
    </article>
  );
}
