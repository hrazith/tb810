"use client";

import { useRouter } from "next/navigation";

type UnitRow = {
  id: string;
  unit_number: string;
  current_owner_name: string | null;
  unit_type_name: string;
  floor: string | null;
  participation_percentage: number;
  has_meter: boolean | null;
  updated_at: string;
};

type Props = {
  units: UnitRow[];
};

function formatParticipation(value: number) {
  return `${value.toFixed(4).replace(/\.?0+$/, "")}%`;
}

export function UnitsTable({ units }: Props) {
  const router = useRouter();

  return (
    <table className="relative min-w-full divide-y divide-zinc-300">
      <thead>
        <tr>
          <th scope="col" className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-zinc-900 sm:pl-0">
            Unit
          </th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Owner
          </th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Type
          </th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Floor
          </th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Participation
          </th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900">
            Meter
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 bg-white">
        {units.map((unit) => (
          <tr
            key={unit.id}
            tabIndex={0}
            role="link"
            aria-label={`View ${unit.unit_number}`}
            onClick={() => router.push(`/units/${unit.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/units/${unit.id}`);
              }
            }}
            className="cursor-pointer hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none"
          >
            <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-zinc-900 sm:pl-0">
              {unit.unit_number}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              {unit.current_owner_name ?? "Unassigned"}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              {unit.unit_type_name}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              {unit.floor ?? "—"}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              {formatParticipation(unit.participation_percentage)}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              {unit.has_meter ? "Yes" : "No"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
