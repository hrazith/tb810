import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { OwnerAvisoDocument } from "./owner-aviso-document";
import type { OwnerAvisoData } from "./owner-aviso-data";

export function ownerAvisoFilename(data: Pick<OwnerAvisoData, "obligationMonth" | "owner">) {
  return `TB810-${data.obligationMonth}-${data.owner.reference}.pdf`;
}

export function renderOwnerAvisoPdf(data: OwnerAvisoData, generatedAt: Date) {
  // OwnerAvisoDocument renders a <Document>, which is what renderToBuffer expects.
  const document = createElement(OwnerAvisoDocument, { data, generatedAt }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(document);
}
