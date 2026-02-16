# Content Systems Skill

## Do
- Store template libraries in DB.
- Use deterministic seed/week selection.
- Version and review content changes via seed scripts.
- Keep deterministic in-code template libraries for interaction-only microcopy (`/say`, `/date`, mascot answers) when DB seeding is unnecessary.

## Don't
- Don't generate production loop text from ad-hoc LLM prompts.

## Example
- Horoscope uses seeded archetype variants for mode/context combinations.
- Date generator uses deterministic template ranking by selected filters (energy/budget/time).
