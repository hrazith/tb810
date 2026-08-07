"use client";

import { useActionState, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type {
  UnitFormDefaults,
  UnitFormState,
  UnitInput,
  UnitTypeRecord,
} from "@/server/units/types";

type Props = {
  defaults: UnitFormDefaults;
  action: (
    prevState: UnitFormState,
    formData: FormData,
  ) => Promise<UnitFormState>;
  submitLabel: string;
};

const initialState: UnitFormState = {};

function fieldError(field: string, state: UnitFormState) {
  return state.fieldErrors?.[
    field as keyof NonNullable<UnitFormState["fieldErrors"]>
  ];
}

function typeLabel(unitType: UnitTypeRecord) {
  switch (unitType.code) {
    case "condo":
      return "Residential";
    case "parking":
      return "Parking";
    case "storage":
      return "Storage";
  }
}

function meterAllowed(unitTypeId: string | undefined, unitTypes: UnitTypeRecord[]) {
  const unitType = unitTypes.find((item) => item.id === unitTypeId);
  return unitType?.code === "condo";
}

export function UnitForm({ defaults, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = { ...defaults.values, ...(state.values ?? {}) } as Partial<UnitInput> & {
    active?: boolean;
  };
  const [selectedTypeId, setSelectedTypeId] = useState(
    values.unit_type_id ?? defaults.unitTypes[0]?.id ?? "",
  );
  const [hasMeter, setHasMeter] = useState(Boolean(values.has_meter));
  const [hasGasService, setHasGasService] = useState(Boolean(values.has_gas_service));

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const nextTypeId = values.unit_type_id ?? defaults.unitTypes[0]?.id ?? "";
    setSelectedTypeId(nextTypeId);
    setHasMeter(Boolean(values.has_meter));
    setHasGasService(Boolean(values.has_gas_service));
  }, [defaults.unitTypes, values.has_gas_service, values.has_meter, values.unit_type_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const meterIsAllowed = meterAllowed(selectedTypeId, defaults.unitTypes);
  const effectiveHasMeter = meterIsAllowed ? hasMeter : false;
  const effectiveHasGasService = meterIsAllowed ? hasGasService : false;

  return (
    <Panel as="form" action={formAction} className="space-y-6">
      <input
        type="hidden"
        name="building_id"
        value={values.building_id ?? defaults.building?.id ?? ""}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <fieldset className="space-y-3 md:col-span-2">
          <legend className="block text-lg font-medium text-zinc-900">
            Type
          </legend>
          <div
            role="radiogroup"
            aria-label="Type"
            className="grid gap-2 sm:grid-cols-3"
          >
            {defaults.unitTypes.map((unitType) => {
              const checked = unitType.id === selectedTypeId;
              return (
                <label
                  key={unitType.id}
                  className={`flex min-h-16 cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-white ${
                    checked
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950"
                  }`}
                >
                  <span className="font-medium">{typeLabel(unitType)}</span>
                  <input
                    type="radio"
                    name="unit_type_id"
                    value={unitType.id}
                    checked={checked}
                    onChange={() => {
                      setSelectedTypeId(unitType.id);
                      if (unitType.code !== "condo") {
                        setHasMeter(false);
                        setHasGasService(false);
                      }
                    }}
                    className="sr-only"
                  />
                </label>
              );
            })}
          </div>
          {fieldError("unit_type_id", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("unit_type_id", state)}
            </p>
          ) : null}
        </fieldset>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">
            Unit number
          </span>
          <Input
            name="unit_number"
            defaultValue={values.unit_number ?? ""}
            aria-invalid={Boolean(fieldError("unit_number", state)) || undefined}
          />
          {fieldError("unit_number", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("unit_number", state)}
            </p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Floor</span>
          <Input
            name="floor"
            defaultValue={values.floor ?? ""}
            aria-invalid={Boolean(fieldError("floor", state)) || undefined}
          />
          {fieldError("floor", state) ? (
            <p className="text-sm text-red-600">{fieldError("floor", state)}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">
            Registered area (m²)
          </span>
          <Input
            name="registered_area_m2"
            type="number"
            step="0.001"
            min="0"
            defaultValue={values.registered_area_m2 ?? ""}
            aria-invalid={
              Boolean(fieldError("registered_area_m2", state)) || undefined
            }
          />
          {fieldError("registered_area_m2", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("registered_area_m2", state)}
            </p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">
            Participation percentage
          </span>
          <Input
            name="participation_percentage"
            type="number"
            step="0.0001"
            min="0"
            max="100"
            defaultValue={values.participation_percentage ?? 0}
            aria-invalid={
              Boolean(fieldError("participation_percentage", state)) || undefined
            }
          />
          {fieldError("participation_percentage", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("participation_percentage", state)}
            </p>
          ) : null}
        </label>

        <fieldset className="space-y-3">
          <legend className="block text-lg font-medium text-zinc-900">
            Meter and service
          </legend>
          {!meterIsAllowed ? (
            <p className="text-sm text-zinc-500">
              Parking and storage units cannot participate in water or gas service enrollment.
            </p>
          ) : null}
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="has_meter"
                checked={effectiveHasMeter}
                onChange={(event) => setHasMeter(event.target.checked)}
                disabled={!meterIsAllowed}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-950"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-zinc-900">
                  Individual water meter
                </span>
                <span className="block text-sm text-zinc-600">
                  This Unit participates in individual Water meter readings.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="has_gas_service"
                checked={effectiveHasGasService}
                onChange={(event) => setHasGasService(event.target.checked)}
                disabled={!meterIsAllowed}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-950"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-zinc-900">Gas service</span>
                <span className="block text-sm text-zinc-600">
                  This Unit participates in the building Gas service and has an individual Gas meter.
                </span>
              </span>
            </label>
          </div>
          {fieldError("has_meter", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("has_meter", state)}
            </p>
          ) : null}
          {fieldError("has_gas_service", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("has_gas_service", state)}
            </p>
          ) : null}
        </fieldset>
      </div>

      <label className="block space-y-2">
        <span className="block text-lg font-medium text-zinc-900">Notes</span>
        <textarea
          name="notes"
          rows={5}
          defaultValue={values.notes ?? ""}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-950"
        />
      </label>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitLabel}
        </button>
      </div>
    </Panel>
  );
}
