# Asset-Edge Architecture

This document is the long-term architectural reference for Asset-Edge.

It captures the platform-level decisions that every client built on Asset-Edge inherits.

Asset-Edge is not designed as a CRUD application. It models real-world operations and the state changes that matter to a business.

## Platform Vision

Asset-Edge is a multi-tenant property management platform.

It provides a common operating foundation for independent property management organizations, including:

- Stellar Rentals
- TB810
- Highline
- future organizations

Each organization may have unique workflows, regulations, and branding while sharing the same platform foundation.

The key architectural question is:

"Is this a platform capability or an organization-specific customization?"

Platform capabilities belong in Asset-Edge.
Organization-specific behavior should stay behind clean boundaries in the relevant organization layer.

Asset-Edge is also an operational platform that continuously understands the state of a property portfolio, identifies what requires human attention, and orchestrates people, processes, and AI to keep operations running smoothly.

Its long-term direction is to evolve from a system of record into a system of operational intelligence.

That means Asset-Edge should not merely store facts.
It should help organizations understand:

- what needs attention
- what is overdue
- what requires intervention
- what presents financial risk
- what operational bottlenecks exist
- what actions should happen next

Modules such as Finance, Leasing, Maintenance, CRM, and Documents are knowledge domains.

Operational Intelligence sits above those domains and provides a unified operational view of the portfolio.

## Architecture Philosophy

Asset-Edge follows this progression:

Reality

Source Facts

Business Objects

Domain Logic / Calculation Services

Business Events

Operational Intelligence

Human Action

Each layer has a single responsibility.

### Reality

The real world is the source of everything Asset-Edge represents.

Examples include a meter reading, a signed lease, a supplier bill, a payment, or a maintenance issue.

### Source Facts

Source Facts are the auditable inputs that describe reality in the platform.

Humans, or AI with human verification, enter or confirm source facts.

Source facts must remain traceable and explainable.

### Business Objects

Business Objects organize facts into durable domain concepts.

They give the platform structure without pretending to be the whole truth.

### Domain Logic / Calculation Services

Domain Logic and Calculation Services apply deterministic business rules.

They transform source facts into derived business outcomes.

This layer must be explainable and repeatable.

### Business Events

Business Events represent meaningful changes within a domain.

They are not notifications.

They are the platform's way of announcing that a domain state has changed in a significant way.

### Operational Intelligence

Operational Intelligence consumes Business Events, determines operational significance, and produces Attention Items.

It does not own domain rules.

### Human Action

Humans respond to what the platform surfaces.

The platform should reduce effort and increase clarity, but not replace accountability.

## Finance Philosophy

Finance in Asset-Edge follows this progression:

Facts

Calculations

Accounting

Planning

### Facts

Facts are entered by humans, or by AI with human verification.

Examples include:

- payments
- invoices
- meter readings
- supplier bills
- signed leases

### Calculations

Calculations are deterministic business outcomes derived from facts.

Examples include:

- water allocation
- budget allocation
- rent obligations

### Accounting

Accounting is the historical record.

Accounting never recalculates history.

If a correction is needed, the platform records a new historical fact or event rather than rewriting the past.

### Planning

Planning is future-oriented.

It supports forecasting, budget planning, and scenario modelling.

Planning belongs after accounting.

## Strategic Goals

Asset-Edge is being shaped through a few platform-wide goals.

### Canonical Platform

The repository should become the canonical Asset-Edge platform rather than a Stellar- or TB810-specific branch of the product.

The platform should remain clean, simplified, and reusable so multiple organizations can share the same business logic without duplication.

### Operational Intelligence

Operational Intelligence is a core platform philosophy.

Asset-Edge should increasingly answer:

- what needs attention
- what is overdue
- what requires intervention
- what presents financial risk
- what bottlenecks exist
- what action should happen next

### Canonical Finance Engine

Finance concepts such as:

- financial obligations
- payments
- payment allocation
- ledgers
- balances
- reconciliation
- accounting events
- financial reporting

should be developed as reusable platform capabilities whenever they are not organization-specific.

Organization-specific tax rules, invoice layouts, and jurisdictional requirements should remain configurable.

## Event-Driven Platform

Every domain should publish meaningful Business Events wherever practical.

Business Events are domain changes, not delivery mechanisms for messages or notifications.

Examples:

### Water

- Meter Reading Recorded
- Supplier Bill Imported
- Water Allocation Updated
- Water Period Closed

### Leasing

- Lease Executed
- Lease Renewed
- Lease Expiring

### Payments

- Payment Received
- Payment Failed
- Payment Allocated

### Maintenance

- Work Order Created
- Work Order Completed

Domains should communicate through Business Events rather than directly triggering notifications whenever practical.

## Operational Intelligence

Operational Intelligence is a platform capability, not a business domain.

Its purpose is to consume Business Events, determine operational significance, and generate Attention Items.

Future responsibilities may include:

- dashboards
- alerts
- notifications
- email digests
- push notifications
- AI assistants
- anomaly detection
- escalation

Operational Intelligence should know nothing about leases, water, finance, or other domain internals.

It consumes events.

It does not own business rules.

## Attention Items

An Attention Item represents something requiring human awareness or intervention.

Examples include:

- unusually high water consumption
- lease expiring
- payment failed
- overdue work order
- missing meter reading
- OCR confidence below threshold
- budget variance

Dashboards should increasingly become attention-centric rather than data-centric.

Instead of asking "What happened?", Asset-Edge should increasingly answer "What requires my attention?"

## AI Philosophy

AI augments Asset-Edge.

AI does not replace business logic.

AI may:

- extract meter readings
- classify invoices
- summarize issues
- identify anomalies
- recommend actions

AI should never become the source of truth.

Humans remain accountable.

Business facts remain auditable.

## Feature Classification

Every feature should be classified as one of three categories:

1. Platform Capability
2. Organization Workflow
3. Experimental Capability

Platform capabilities are reusable by multiple organizations and belong in Asset-Edge.

Organization workflows are specific to a single organization and belong inside that organization's implementation layer.

Experimental capabilities can be validated in a single workflow before being promoted into shared platform capabilities.

## Domain Template

Every domain should describe:

- Purpose
- Business Objects
- Source Facts
- Business Rules
- Calculation Services
- Published Business Events
- Consumed Events, if applicable
- Attention Candidates
- Future AI Opportunities

This is the standard template for future architecture work.

## Development Philosophy

Build through small vertical business slices.

Each slice should:

- solve a real operational problem
- be testable by a real customer
- produce working software
- be reviewed architecturally before extraction into the platform

Avoid speculative abstractions.

Prefer proving concepts through working implementations before promoting them into shared platform capabilities.

The guiding philosophy is:

"Build features for today's client. Extract capabilities for tomorrow's platform."

## Guiding Principles

- Reality before UI.
- Humans enter or verify facts.
- Facts are immutable.
- Calculations are deterministic and explainable.
- Accounting preserves history.
- Planning supports decisions.
- Domains own business logic.
- Domains publish meaningful Business Events.
- Operational Intelligence determines significance.
- AI assists.
- Humans remain accountable.
- Every financial number must be explainable from source facts.
- Automation should remove effort, not accountability.
