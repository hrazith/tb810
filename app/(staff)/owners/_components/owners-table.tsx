"use client";

import { useRouter } from "next/navigation";

type OwnerRow = {
  id: string;
  full_name: string;
  owner_reference: string;
  email: string | null;
  phone_number: string | null;
  active: boolean;
  unit_count: number;
};

type Props = {
  owners: OwnerRow[];
};

export function OwnersTable({ owners }: Props) {
  const router = useRouter();

  return (
    <table className="relative min-w-full divide-y divide-zinc-300">
      <thead>
        <tr>
          <th
            scope="col"
            className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-zinc-900 sm:pl-0"
          >
            Name
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
          >
            Reference
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
          >
            Contact
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
          >
            Status
          </th>
          <th
            scope="col"
            className="px-3 py-3.5 text-left text-sm font-semibold text-zinc-900"
          >
            Units
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 bg-white">
        {owners.map((owner) => (
          <tr
            key={owner.id}
            tabIndex={0}
            role="link"
            aria-label={`View ${owner.full_name}`}
            onClick={() => router.push(`/owners/${owner.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/owners/${owner.id}`);
              }
            }}
            className="cursor-pointer hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none"
          >
            <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-zinc-900 sm:pl-0">
              {owner.full_name}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              {owner.owner_reference}
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              <div className="space-y-1">
                <p>{owner.email ?? "No email"}</p>
                <p>{owner.phone_number ?? "No phone"}</p>
              </div>
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  owner.active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {owner.active ? "Active" : "Archived"}
              </span>
            </td>
            <td className="px-3 py-4 text-sm whitespace-nowrap text-zinc-500">
              {owner.unit_count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
