# Team Process — How We Build with Claude Code

This is the playbook for running this project. It's written so a **new manager or developer can read it once and run the whole pipeline.** The process lives **here and in the Humble Task Force Claude Code plugin — not in any one person's head.** Anyone who installs the plugin and clones the repo inherits it.

> **New manager? Read this, then `docs/PRD.md` (the product) and `CLAUDE.md` (architecture).** That's enough to start.

## Roles
- **Manager (PM):** sets up the foundation (PRD + CLAUDE.md), turns work into tickets, decides the things only they know (access, hosting, scope), reviews finished work.
- **Developer:** executes a ticket with Claude Code, hands off a report, opens a PR.

## The pipeline
```
/draft-prd → /draft-architecture → /draft-ticket → Issue → /start-ticket → build → /handoff → PR → /manager-review → merge
 (PRD)         (CLAUDE.md)           (manager)              (dev: train+plan) (dev)           (dev)      (manager + Claude)
```

## 0. Foundation — once per project
Before any tickets, lay the groundwork the rest of the pipeline reads:
- **`/setup-tickets`** — scaffolds the templates, folders, and this doc.
- **`/draft-prd <idea>`** — interviews the manager to write `docs/PRD.md` (the product spec).
- **`/draft-architecture`** — turns the PRD + codebase into `CLAUDE.md` (architecture + rules every dev's Claude reads automatically).

These two docs ground everything: tickets reference the PRD, and every `/start-ticket` and `/draft-ticket` reads `CLAUDE.md`. **The pipeline doesn't work well without them — do this first.**

## 1. Making a ticket — manager
Run **`/draft-ticket <what you want built>`**. Claude grounds itself in `CLAUDE.md` + the PRD, drafts the ticket, then **interviews you** — surfacing the questions a developer would otherwise call you about (access, credentials, repo placement, hosting, scope) **with recommended answers**. You confirm; Claude bakes them in, saves the draft, and creates the GitHub issue.

Principles:
- **Definition of Ready:** a ticket must be runnable by a junior dev cold — front-load your tribal knowledge.
- **Secrets never go in tickets.** The ticket says *what* the dev needs and *where to get it*; the secret travels by a secure channel.

## 2. Executing a ticket — developer
Run **`/start-ticket <issue#>`**. Claude reads the ticket + `CLAUDE.md` + PRD, gives a plain-language walkthrough, and **asks if you want anything explained before starting (training mode)** — ask freely, then say "ready". It proposes a plan, you confirm, it builds on a `ticket-<#>-<slug>` branch.

## 3. Handing off — developer
Run **`/handoff <issue#>`** — writes `handoffs/ticket-<#>.md` from the **real git diff**. Open a PR; the template links the handoff.

## 4. Reviewing — manager
Run **`/manager-review <PR#>`** — Claude checks the diff + handoff against the ticket's acceptance criteria and flags risks at `file:line`. Then run the app yourself. Approve or request changes.

## Onboarding a new manager (the whole point)
1. Install the plugin: `/plugin marketplace add Humble-Coders/humble-task-force` then `/plugin install humble-task-force@humble-coders`.
2. Get repo access; `gh auth login`.
3. Read this file, `docs/PRD.md`, and `CLAUDE.md`.
4. You now have the full pipeline — foundation to review. **Nothing is stored in a person; it's all in the plugin + the repo.**
