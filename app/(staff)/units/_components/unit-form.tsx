"use client";

import Link from "next/link";
import { useActionState } from "react";

import type {
  UnitFormDefaults,
  UnitFormState,
  UnitInput,
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

export function UnitForm({ defaults, action, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = { ...defaults.values, ...(state.values ?? {}) } as Partial<UnitInput> & {
    active?: boolean;
  };

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"
    >
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

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">Type</span>
          <select
            name="unit_type_id"
            defaultValue={values.unit_type_id ?? ""}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
          >
            <option value="">Select type</option>
            {defaults.unitTypes.map((unitType) => (
              <option key={unitType.id} value={unitType.id}>
                {unitType.name}
              </option>
            ))}
          </select>
          {fieldError("unit_type_id", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("unit_type_id", state)}
            </p>
          ) : null}
        </label>

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

        <label className="space-y-2">
          <span className="block text-lg font-medium text-zinc-900">
            Has individual meter
          </span>
          <select
            name="has_meter"
            defaultValue={yesNoValue(values.has_meter)}
            className="h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm outline-none focus:border-zinc-950"
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          {fieldError("has_meter", state) ? (
            <p className="text-sm text-red-600">
              {fieldError("has_meter", state)}
            </p>
          ) : null}
        </label>
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
    </form>
  );
}
