# FinCrimeRadar 🛡️

**Free, open-source AML, sanctions, and PEP screening tool.**

FinCrimeRadar is a free educational platform for compliance students and professionals who want to understand how real-world financial crime screening works, sanctions checks, PEP screening, adverse media monitoring, and hands-on investigation practice, all powered by live public data.

🌐 **Live at:** [fincrimeradar.org](https://fincrimeradar.org)

---

## What's live

| Feature | Status |
|---|---|
| 🛡️ Sanctions screening (OFAC, UN, EU, OFSI, 40+ lists) | ✅ Live |
| 🔍 PEP screening | ✅ Live |
| 📰 Adverse media monitoring | ✅ Live |
| 📚 AML Knowledge Hub (practitioner-written guide series) | ✅ Live |
| 🧪 Scenario Lab (interactive investigation trainer) | ✅ Live |
| ⚙️ Public API with docs | 🔜 Planned |

### Screening tool

Free, real-time name screening against sanctions lists, PEP databases, and adverse media, no sign-up required. Powered by [OpenSanctions](https://www.opensanctions.org) (OFAC, UN, EU, OFSI, and 40+ global lists) plus adverse media coverage sourced via GDELT, including BBC and OCCRP reporting. The dataset currently spans over 131,000 combined sanctions and PEP records (72,000+ sanctions records, 59,000+ PEP profiles), checked daily against the live OpenSanctions feed. Matching uses adjustable fuzzy-match thresholds so results reflect real screening tradeoffs between missed hits and false positives.

### Knowledge Hub

Practitioner-written guides covering UK AML compliance in depth:

- **UK AML Compliance: The Complete Guide** (3 parts)
- **PEP Screening Handbook** (3 parts)
- **Suspicious Activity Reports: The Complete Guide** (3 parts)
- **FATF: The Practitioner's Handbook** (2 parts)
- **The MLRO Handbook** (2 parts)
- **The Crypto Guide** (6 parts)
- Standalone long-form guides: Screening Alert Survival Guide, Transaction Monitoring Guide, KYC Onboarding Dilemma, Sanctions Compliance Guide

### Scenario Lab

A free, interactive investigation trainer with two modules:

- **KYC/KYB** — build out the ultimate beneficial ownership tree, screen each entity against sanctions and PEP data, and reach a disposition decision.
- **Fraud Detection** — account events play back one at a time with a live risk signal, testing judgement under incomplete information rather than pattern-matching a fully assembled case file.

Every case is authored specifically for the tool, not adapted from a public enforcement action.

---

## Tech stack

- **Backend:** Python + FastAPI, in a separate repo, [fincrimeradar-api](https://github.com/prats922/fincrimeradar-api)
- **Screening engine:** OpenSanctions API + fuzzy matching (rapidfuzz), adverse media via GDELT
- **Frontend:** HTML/CSS/JS (no framework, this repo)
- **Hosting:** Vercel (frontend) + Render (API)

---

## Roadmap

- [x] Domain registered
- [x] Landing page live
- [x] GitHub repo set up
- [x] Sanctions screening engine
- [x] PEP screening
- [x] Adverse media monitoring
- [x] Knowledge hub
- [x] Scenario Lab investigation trainer
- [ ] Wire Scenario Lab to the live fincrimeradar-api backend (currently runs on local case data)
- [ ] Public API with docs for external developers

---

## Contributing

This project is being built in public. Contributions, feedback, and ideas are welcome.

Open an issue or reach out at [hello@fincrimeradar.org](mailto:hello@fincrimeradar.org)

---

## Disclaimer

FinCrimeRadar is an **educational tool** only. Results are for learning purposes and should not be used as a substitute for regulated compliance screening solutions. Always verify against official sanction list sources for compliance decisions.

---

## License

MIT License — free to use, modify, and distribute.
