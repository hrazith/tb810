"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Surface } from "@/components/ui/surface";
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
  cancelHref: string;
};

const initialState: UnitFormState = {};

function fieldError(field: string, state: UnitFormState) {
  return state.fieldErrors?.[
    field as keyof NonNullable<UnitFormState["fieldErrors"]>
  ];
}

function yesNoValue(value?: boolean) {
  return value ? "yes" : "no";
}

function typeLabel(unitType: UnitTypeRecord) {
  switch (unitType.code) {
    case "condo":
      return "Apartment";
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

export function UnitForm({ defaults, action, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = { ...defaults.values, ...(state.values ?? {}) } as Partial<UnitInput> & {
    active?: boolean;
  };
  const [selectedTypeId, setSelectedTypeId] = useState(
    values.unit_type_id ?? defaults.unitTypes[0]?.id ?? "",
  );
  const [meterValue, setMeterValue] = useState(
    values.has_meter ? "yes" : "no",
  );

  useEffect(() => {
    const nextTypeId = values.unit_type_id ?? defaults.unitTypes[0]?.id ?? "";
    setSelectedTypeId(nextTypeId);
    setMeterValue(values.has_meter ? "yes" : "no");
  }, [defaults.unitTypes, values.has_meter, values.unit_type_id]);

  const meterIsAllowed = meterAllowed(selectedTypeId, defaults.unitTypes);
  const effectiveMeterValue = meterIsAllowed ? meterValue : "no";

  return (
    <Surface as="form" action={formAction} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {defaults.showBuildingSelector ? (
          <label className="space-y-2 md:col-span-2">
            <span className="block text-lg font-medium text-zinc-900">
              Building
            </span>
            <select
              name="building_id"
              defaultValue={values.building_id ?? defaults.building?.id ?? ""}
              className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
            >
              {defaults.buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
            {fieldError("building_id", state) ? (
              <p className="text-sm text-red-600">
                {fieldError("building_id", state)}
              </p>
            ) : null}
          </label>
        ) : (
          <input
            type="hidden"
            name="building_id"
            value={values.building_id ?? defaults.building?.id ?? ""}
          />
        )}

        <fieldset className="space-y-3 md:col-span-2">
          <legend className="block text-lg font-medium text-zinc-900">Type</legend>
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
                          setMeterValue("no");
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
          <input
            name="unit_number"
            defaultValue={values.unit_number ?? ""}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
          />
          {fieldError("unit_number", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("unit_number", state)}
            </p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Floor</span>
          <input
            name="floor"
            defaultValue={values.floor ?? ""}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
          />
          {fieldError("floor", state) ? (
            <p className="text-sm text-red-600">{fieldError("floor", state)}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">
            Registered area (m²)
          </span>
          <input
            name="registered_area_m2"
            type="number"
            step="0.001"
            min="0"
            defaultValue={values.registered_area_m2 ?? ""}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
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
          <input
            name="participation_percentage"
            type="number"
            step="0.0001"
            min="0"
            max="100"
            defaultValue={values.participation_percentage ?? 0}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
          />
          {fieldError("participation_percentage", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("participation_percentage", state)}
            </p>
          ) : null}
        </label>

        <fieldset className="space-y-3">
          <legend className="block text-lg font-medium text-zinc-900">
            Has individual meter
          </legend>
          {!meterIsAllowed ? (
            <p className="text-sm text-zinc-500">
              Parking and storage units do not use an individual meter.
            </p>
          ) : null}
          <div
            role="radiogroup"
            aria-label="Has individual meter"
            className="grid gap-2 sm:grid-cols-2"
          >
            {["no", "yes"].map((option) => {
              const checked = effectiveMeterValue === option;
              const disabled = option === "yes" && !meterIsAllowed;
              return (
                <label
                  key={option}
                  className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-white ${
                    checked
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950"
                  } ${disabled ? "cursor-not-allowed opacity-50 hover:border-zinc-300 hover:text-zinc-700" : ""}`}
                >
                  <input
                    type="radio"
                    name="has_meter"
                    value={option}
                    checked={checked}
                    onChange={() => setMeterValue(option)}
                    disabled={disabled}
                    className="sr-only"
                  />
                  {option === "yes" ? "Yes" : "No"}
                </label>
              );
            })}
          </div>
          {fieldError("has_meter", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("has_meter", state)}
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
        <Link
          href={cancelHref}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
        >
          Cancel
        </Link>
      </div>
    </Surface>
  );
}
