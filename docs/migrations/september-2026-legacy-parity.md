# September 2026 Legacy Financial Parity

**Status: PROVEN / CLOSED**

This is the read-only reconciliation record for the final legacy-generated
obligation month before October 2026 First Ride. It does not create a native
September package and does not change historical data.

## Result

- 77 maintenance bills, 76 distinct owners
- 77/77 mathematically explained
- 77/77 exact legacy detail-level reconciliation
- 77/77 fixed-assessment detail parity
- 64/64 legacy Metered Water allocations reproduced
- 64/64 Common Water allocations reproduced
- 58/77 exact persisted-parent parity
- 19/77 explained parent/detail differences of +/- PEN 0.01
- Aggregate parent/detail difference: -PEN 0.05
- Unexplained obligations: 0

## Sources And Boundary

The authoritative legacy source is [`legacy/sql/torrebal_admincondo.sql`](../../legacy/sql/torrebal_admincondo.sql), supplemented for the 64 August Unit Water readings by the canonical TB810 `tb810_meter_readings` records. September parity uses August source facts only:

```text
August legacy source facts -> September legacy obligations
September native source facts -> October native obligations
```

The September native source facts are not used in this reconciliation.

## Fixed Assessments

```text
Budget                                      PEN 20,055.00
Base fixed assessments                      PEN 20,051.80
September historical adjustments            PEN  1,412.40
Expected/detail fixed                      PEN 21,464.20
Persisted parent fixed                     PEN 21,464.15
```

The adjustment total is 63 condos at PEN 22.00, Unit 904 at PEN 10.00,
EST-13 at PEN 8.40, and EST-42 at PEN 8.00. These values reproduce September
history; Unit 904, EST-13, and EST-42 remain open for October and do not carry
forward automatically.

## Water Rules

August source facts are 64 Unit Water readings totaling 686 consumption units,
plus Sedapal `11,435 -> 12,146`, consumption 711, invoice PEN 3,042.00.

Legacy stored the rounded building unit price PEN 4.28 and calculated each
condo as:

```text
round(unit consumption * PEN 4.28, 2)
```

This reproduces all 64 legacy `AGUA` lines and totals PEN 2,936.08. Common
Water is PEN 1.67 per condo, or PEN 106.88 across 64 condos. Legacy Water
therefore totals PEN 3,042.96 exactly.

Current TB810 intentionally uses the precise rate `PEN 3,042 / 711`, producing
PEN 2,935.07 Metered Water, an exact residual pool of PEN 106.93, and rounded
Common Water of PEN 106.88. The current-style combined Water is PEN 3,041.95.
The PEN 1.01 difference from legacy is a proven calculation-policy difference,
not missing data or an unexplained parity failure.

**Open October product decision:** retain the precise TB810 rate, or reproduce
the legacy convention of rounding the building unit price before per-unit
allocation. No decision or code change is made by this record.

**Resolved October 9, 2026:** TB810 keeps the precise rate from November 2026
onward; the legacy rounded rate is not adopted. See the AGUA rule in
[`tb810-water-domain.md`](../tb810-water-domain.md).

No residual-cent redistribution is used.

## Others

The six September detail lines total PEN 180.00 and match the parent Others
total exactly:

| Bill | Owner | Description | Amount | Evidence classification |
| ---: | --- | --- | ---: | --- |
| 4712 | Julio Poterico Rojas | Lavanderia | 30.00 | Likely unit-specific |
| 4717 | Oscar Bruno Orellana Roldan | Servicio porteria a Empresas | 30.00 | Unknown / possibly owner-specific |
| 4730 | Alicia Valega Baella | lavanderia | 30.00 | Likely unit-specific |
| 4733 | Julio Poterico Rojas | Lavanderia deposito 19 | 30.00 | Clear unit-specific: DEPOS-19 |
| 4742 | Miguel Cordero | Lavanderia | 30.00 | Likely unit-specific |
| 4746 | Nora Penagos Cuadros | Lavanderia | 30.00 | Likely unit-specific |

Their historical amounts are explained, but native Unit Charge versus Owner
Direct Charge mapping remains open.

## Hugo Control Case

Legacy owner 6, Hugo Aduvire Pataca, has Unit 201, EST-17, and DEPOS-30.

| Component | Amount |
| --- | ---: |
| Unit 201 fixed | PEN 391.81 |
| EST-17 fixed | PEN 35.50 |
| DEPOS-30 fixed | PEN 11.03 |
| Fixed total | PEN 438.34 |
| Metered Water | PEN 4.28 |
| Common Water | PEN 1.67 |
| Persisted total | **PEN 444.29** |

The legacy UI screenshot showed PEN 444.30 with “Includes Rounding”; the
database value PEN 444.29 is the parity target.

## 77 Bills / 76 Owners

Legacy owner 56, Virginia Barandiaran Pagador, has two legitimate persisted
rows: bill 4757 for Unit 1203 and bill 4758 for EST-42 and DEPOS-1. They
reconcile independently. The dump does not establish why the historical
generator split them, and native TB810 does not need to reproduce that grouping.

## Compact Reconciliation Ledger

Amounts are PEN. `Detail` is reconstructed from fixed, legacy-rate Metered
Water, Common Water, and Others. `Parent` is the persisted parent total.

| Bill | Owner | Applicable units | Fixed | Metered | Common | Other | Detail | Parent |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4711 | Hugo Aduvire Pataca | 201, EST-17, DEPOS-30 | 438.34 | 4.28 | 1.67 | 0.00 | 444.29 | 444.29 |
| 4712 | Julio Poterico Rojas | 202, EST-60, DEPOS-31 | 266.07 | 4.28 | 1.67 | 30.00 | 302.02 | 302.02 |
| 4713 | Santiago Vasquez Moran | 203 | 232.78 | 8.56 | 1.67 | 0.00 | 243.01 | 243.01 |
| 4714 | Carlos Paz Guerrero | 204 | 130.90 | 55.64 | 1.67 | 0.00 | 188.21 | 188.21 |
| 4715 | Hilda Luz Velez Ghersi | 205, DEPOS-11 | 155.77 | 25.68 | 1.67 | 0.00 | 183.12 | 183.12 |
| 4716 | Gustavo Enrique Lopez Cordero | 206, EST-24, DEPOS-35 | 521.37 | 68.48 | 1.67 | 0.00 | 591.52 | 591.52 |
| 4717 | Oscar Bruno Orellana Roldan | 301, EST-22, DEPOS-27 | 445.95 | 0.00 | 1.67 | 30.00 | 477.62 | 477.63 |
| 4718 | Betty Margot Medina Cardenas | 302, EST-15 | 242.41 | 64.20 | 1.67 | 0.00 | 308.28 | 308.27 |
| 4719 | Oscar Maximo Marimon Pacheco | 303, EST-52 | 275.30 | 38.52 | 1.67 | 0.00 | 315.49 | 315.48 |
| 4720 | Carlos Paz Guerrero | 304 | 130.90 | 29.96 | 1.67 | 0.00 | 162.53 | 162.53 |
| 4721 | Rosa Bracamonte | 305, DEPOS-8 | 155.97 | 12.84 | 1.67 | 0.00 | 170.48 | 170.48 |
| 4722 | Juan Antonio Marin Delgado | 401, EST-23, EST-34, DEPOS-7 | 484.07 | 47.08 | 1.67 | 0.00 | 532.82 | 532.82 |
| 4723 | Maria Elena Garreaud Indecochez | 402, EST-21 | 241.60 | 55.64 | 1.67 | 0.00 | 298.91 | 298.91 |
| 4724 | Juan Gabriel Perez Cuba | 403, EST-12, DEPOS-43 | 304.98 | 47.08 | 1.67 | 0.00 | 353.73 | 353.73 |
| 4725 | Bertha Vanessa Souza | 404, EST-57 | 181.04 | 0.00 | 1.67 | 0.00 | 182.71 | 182.71 |
| 4726 | Armando Enrique Cueto Duthurburu | 405, EST-55 | 201.69 | 4.28 | 1.67 | 0.00 | 207.64 | 207.64 |
| 4727 | Walter Perez Rengifo | 406, EST-8, DEPOS-24 | 388.41 | 0.00 | 1.67 | 0.00 | 390.08 | 390.07 |
| 4728 | Gheni Delgado | 501, EST-49, DEPOS-29 | 446.16 | 8.56 | 1.67 | 0.00 | 456.39 | 456.39 |
| 4729 | Carolina Jonsson | 502, EST-7 | 241.60 | 0.00 | 1.67 | 0.00 | 243.27 | 243.27 |
| 4730 | Alicia Valega Baella | 504, EST-45, DEPOS-38 | 186.65 | 34.24 | 1.67 | 30.00 | 252.56 | 252.56 |
| 4731 | Monica Lucrecia Ligarda Castro | 505 | 146.54 | 64.20 | 1.67 | 0.00 | 212.41 | 212.41 |
| 4732 | Jaime Arnaldo Campos Corro | 601, EST-26, DEPOS-44 | 441.75 | 0.00 | 1.67 | 0.00 | 443.42 | 443.42 |
| 4733 | Julio Poterico Rojas | 602, EST-33, DEPOS-6, DEPOS-19 | 262.87 | 38.52 | 1.67 | 30.00 | 333.06 | 333.05 |
| 4734 | Maria Gabriela Tupayachi Ortiz | 603, DEPOS-18 | 240.80 | 107.00 | 1.67 | 0.00 | 349.47 | 349.47 |
| 4735 | Rafael Alberto Brissolese D'Angelo | 604, DEPOS-15 | 141.33 | 17.12 | 1.67 | 0.00 | 160.12 | 160.12 |
| 4736 | Juan Antonio Salas Arias | 605 | 300.56 | 0.00 | 1.67 | 0.00 | 302.23 | 302.23 |
| 4737 | Maximo Cordoba Ramirez | 606, EST-30, DEPOS-22 | 734.55 | 0.00 | 1.67 | 0.00 | 736.22 | 736.22 |
| 4738 | Luigi Antonio Scarin Obando | 702, EST-29 | 241.60 | 12.84 | 1.67 | 0.00 | 256.11 | 256.11 |
| 4739 | Ramon Francisco Labrin Farias | 703, EST-36, DEPOS-10 | 284.73 | 12.84 | 1.67 | 0.00 | 299.24 | 299.23 |
| 4740 | Leonardo Rafael Vela Ansi | 704 | 154.96 | 17.12 | 1.67 | 0.00 | 173.75 | 173.75 |
| 4741 | Karina Merino Peñafiel | 801, EST-9, DEPOS-34 | 443.55 | 158.36 | 1.67 | 0.00 | 603.58 | 603.59 |
| 4742 | Miguel Cordero | 802, EST-31, DEPOS-16 | 249.42 | 12.84 | 1.67 | 30.00 | 293.93 | 293.93 |
| 4743 | Kristopher Joseph Murphy | 803, EST-40, DEPOS-20 | 285.52 | 0.00 | 1.67 | 0.00 | 287.19 | 287.19 |
| 4744 | Ricardina Esther Gutierrez Navarrette | 804, DEPOS-33 | 395.62 | 8.56 | 1.67 | 0.00 | 405.85 | 405.85 |
| 4745 | Mario Guillermo Cornejo Vasquez | 901, EST-51, DEPOS-28 | 448.17 | 21.40 | 1.67 | 0.00 | 471.24 | 471.24 |
| 4746 | Nora Penagos Cuadros | 902, EST-32, DEPOS-17 | 250.02 | 34.24 | 1.67 | 30.00 | 315.93 | 315.94 |
| 4747 | Brenda Valencia Bazalar | 903, EST-39 | 273.69 | 141.24 | 1.67 | 0.00 | 416.60 | 416.60 |
| 4748 | Rosa Maria Graciela Ortiz Origgi | 904, EST-6, EST-41, EST-47, DEPOS-21, DEPOS-26 | 422.32 | 12.84 | 1.67 | 0.00 | 436.83 | 436.84 |
| 4749 | Sergio Antonio Rios Cuellar | 1001, EST-20, DEPOS-49 | 443.15 | 89.88 | 1.67 | 0.00 | 534.70 | 534.70 |
| 4750 | Sergio Antonio Rios Cuellar | 1002, EST-59, DEPOS-12 | 260.46 | 25.68 | 1.67 | 0.00 | 287.81 | 287.80 |
| 4751 | Javier Enrique Espinoza Paz | 1003, EST-46, DEPOS-48, DEPOS-51 | 337.47 | 4.28 | 1.67 | 0.00 | 343.42 | 343.42 |
| 4752 | Amparo Amelia Mejia Breña | 1101 | 391.81 | 55.64 | 1.67 | 0.00 | 449.12 | 449.12 |
| 4753 | Julio Poterico Rojas | 1102 | 199.89 | 29.96 | 1.67 | 0.00 | 231.52 | 231.52 |
| 4754 | Javier Jaime Izquierdo Hurtado | 1103 | 271.48 | 12.84 | 1.67 | 0.00 | 285.99 | 285.99 |
| 4755 | Gustavo de la Puente de la Torre | 1201, EST-19 | 433.52 | 111.28 | 1.67 | 0.00 | 546.47 | 546.48 |
| 4756 | Emilio Garreaud | 1202, EST-56, DEPOS-36 | 261.06 | 0.00 | 1.67 | 0.00 | 262.73 | 262.73 |
| 4757 | Virginia Barandiaran Pagador | 1203 | 271.48 | 42.80 | 1.67 | 0.00 | 315.95 | 315.95 |
| 4758 | Virginia Barandiaran Pagador | EST-42, DEPOS-1 | 62.55 | 0.00 | 0.00 | 0.00 | 62.55 | 62.55 |
| 4759 | Randy Russell Civello | 1302, DEPOS-41 | 225.36 | 21.40 | 1.67 | 0.00 | 248.43 | 248.43 |
| 4760 | Juan Carlos Rengifo Santamaria | 1303 | 271.48 | 55.64 | 1.67 | 0.00 | 328.79 | 328.79 |
| 4761 | Luz Gomez | 1401, EST-25 | 434.33 | 47.08 | 1.67 | 0.00 | 483.08 | 483.08 |
| 4762 | Simon Vainstein Timerman | 1402, EST-27, DEPOS-4, DEPOS-5 | 263.87 | 0.00 | 1.67 | 0.00 | 265.54 | 265.53 |
| 4763 | Marco Antonio Lama Valencia | 1403, EST-37, EST-38 | 356.52 | 81.32 | 1.67 | 0.00 | 439.51 | 439.51 |
| 4764 | Luis Alberto Juy Berengel | 1501, EST-35, DEPOS-46 | 443.96 | 77.04 | 1.67 | 0.00 | 522.67 | 522.67 |
| 4765 | Josefa Torrent Altayo | 1502 | 199.89 | 466.52 | 1.67 | 0.00 | 668.08 | 668.08 |
| 4766 | Edward Martin Aegerter | 1503, EST-53 | 563.69 | 171.20 | 1.67 | 0.00 | 736.56 | 736.56 |
| 4767 | Jorge Martin Paredes Villanueva | 1601, EST-43, EST-44 | 475.23 | 38.52 | 1.67 | 0.00 | 515.42 | 515.43 |
| 4768 | Giovanni Sacco | 1602, EST-58 | 252.63 | 17.12 | 1.67 | 0.00 | 271.42 | 271.42 |
| 4769 | Angel Martin Aguirre Boulanger | 1701, EST-48, DEPOS-23 | 810.16 | 141.24 | 1.67 | 0.00 | 953.07 | 953.07 |
| 4770 | Maria Elena Garreaud Indacochea | 1702, EST-54 | 420.50 | 34.24 | 1.67 | 0.00 | 456.41 | 456.40 |
| 4771 | Vanessa Lavado Carbajal | EST-1 | 40.31 | 0.00 | 0.00 | 0.00 | 40.31 | 40.31 |
| 4772 | Inmobiliaria Recedico | EST-2, EST-18, DEPOS-39 | 128.96 | 0.00 | 0.00 | 0.00 | 128.96 | 128.95 |
| 4773 | Marisol Carbajal Villanueva | EST-3 | 42.52 | 0.00 | 0.00 | 0.00 | 42.52 | 42.52 |
| 4774 | Armando Vargas Llerena | EST-5 | 41.71 | 0.00 | 0.00 | 0.00 | 41.71 | 41.71 |
| 4775 | Fernando Carvallo | EST-13, EST-14 | 93.44 | 0.00 | 0.00 | 0.00 | 93.44 | 93.43 |
| 4776 | Julio Poterico Rojas | EST-4, EST-16, DEPOS-13, DEPOS-32 | 105.08 | 0.00 | 0.00 | 0.00 | 105.08 | 105.09 |
| 4777 | Sergio Balarezo | DEPOS-2 | 9.43 | 0.00 | 0.00 | 0.00 | 9.43 | 9.43 |
| 4778 | Jose del Castillo | DEPOS-40 | 25.47 | 0.00 | 0.00 | 0.00 | 25.47 | 25.47 |
| 4779 | Fernando Moreno Belaunde | DEPOS-45 | 9.23 | 0.00 | 0.00 | 0.00 | 9.23 | 9.23 |
| 4780 | Julio Antonio Poterico Rojas | DEPOS-37 | 12.43 | 0.00 | 0.00 | 0.00 | 12.43 | 12.43 |
| 4781 | Veronica Maria Gavidia Rodriguez | 701, EST-28 | 434.33 | 64.20 | 1.67 | 0.00 | 500.20 | 500.20 |
| 4782 | Laura Cristina Herrera Vega | 1301, EST-50 | 434.13 | 21.40 | 1.67 | 0.00 | 457.20 | 457.20 |
| 4783 | Carlos Avila Bocangra | 503, EST-11, DEPOS-42 | 302.78 | 34.24 | 1.67 | 0.00 | 338.69 | 338.68 |
| 4784 | Lee Alva Gonzales | 306, DEPOS-25 | 346.29 | 29.96 | 1.67 | 0.00 | 377.92 | 377.92 |
| 4785 | Mabel Ramirez | DEPOS-3 | 9.23 | 0.00 | 0.00 | 0.00 | 9.23 | 9.23 |
| 4786 | Mabel Ramirez Jorge Paredes | DEPOS-9 | 12.03 | 0.00 | 0.00 | 0.00 | 12.03 | 12.03 |
| 4787 | Telmo Salazar Gonzales y Carmen Lopez | 506, EST-10 | 376.38 | 94.16 | 1.67 | 0.00 | 472.21 | 472.20 |

## October Boundary And Open Questions

September is the final legacy-generated obligation month. It does not need
native persistence, handoff, Carlos approval, snapshot, or payment migration
to establish parity.

The following remain open for Carlos before October approval:

- Unit 904 historical PEN 10.00
- EST-13 historical PEN 8.40
- EST-42 historical PEN 8.00
- Native semantic mapping of September Others
- The October Water policy choice described above

Carlos's confirmed October-December Bono empleados instruction remains separate:
PEN 22.00 per condo, all 64 condos, PEN 1,408.00 monthly, including Unit 904.
