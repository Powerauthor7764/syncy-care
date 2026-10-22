# Friction Log

I built Syncy Care as a synthetic patient understanding system for the hospital room. This friction log captures the practical problems I encountered while building, validating, and submitting the project, along with the solutions I used to keep the experience working and judge-ready.

## 1. Defining the core product in a narrow but meaningful way

Problem: I needed to make the product feel useful without crossing into unsafe clinical decision-making. The project had to support patient understanding, teach-back, and care-plan clarity without acting as a clinician.

Resolution: I kept the product focused on patient understanding infrastructure, not diagnosis or treatment recommendations. I used synthetic patient data, patient-facing explanations, and safety classifications to make the experience useful and demonstrably safe for a prototype.

## 2. Building a demo that feels realistic but remains synthetic

Problem: The product needed to show real hospital-room workflows while keeping all data synthetic and non-clinical.

Resolution: I modeled three demo patients with care-plan timelines, pending events, teach-back modules, and review queues. That allowed the interface to feel operational without exposing real patient data or making unsupported clinical claims.

## 3. Integrating MCP without over-claiming protocol compliance

Problem: The app needed an MCP-based experience for the Alexa+ track, but I needed to be precise about what was actually verified.

Resolution: I kept the implementation grounded in the tested protocol behavior: initialization, tool discovery, tool execution, and HTTP error handling. I documented the exact scope of validation rather than claiming interoperability beyond what I verified.

## 4. Keeping the product usable across local, demo, and deployment contexts

Problem: A product with both a frontend patient workspace and an MCP server can be difficult to run in a clean environment.

Resolution: I used a clear setup flow, documented commands, and maintained a lightweight local run path. The project includes README guidance and startup scripts to reduce friction for judges and future contributors.

## 5. Balancing feature richness with reliability

Problem: The challenge required a broad set of features: patient workspace, timeline, safety, teach-back, dashboard, review queue, audit logging, and architecture pages.

Resolution: I prioritized the core flows that make the product understandable and show clear user value. I validated the main paths, ensured the interface remained readable, and avoided unnecessary complexity that would have compromised reliability.

## 6. Making the open-source contribution independently useful

Problem: The separate MCP Streamable Proof project needed to be valuable beyond a single app demo.

Resolution: I focused the utility on reproducible MCP checks: initialization, tool discovery, invocation, response validation, and failure handling. That makes the project useful as a general verification utility for self-hosted MCP servers.

## 7. Handling security review before public publishing

Problem: Any public repository must be checked for secrets, credentials, and non-synthetic content before publishing.

Resolution: I reviewed the repository for sensitive content and kept the project scoped to synthetic data only. I also verified the repo and the open-source utility were safe to publish publicly.

## 8. Preparing for Devpost and public judging

Problem: Judges need a clear story, a working product, and a shareable public footprint.

Resolution: I prepared public GitHub links, documentation, and a clean product narrative so the project is easy to understand and judge without hidden setup steps.

## Summary

I developed Syncy Care to demonstrate how patient understanding tools can improve care-plan comprehension in a hospital-room workflow without making clinical decisions. The major friction points were product scope, safety, MCP validation, documentation clarity, and public publication readiness. I resolved these by tightening the product to synthetic, judge-friendly workflows and documenting the exact verified capabilities.

This friction log is intended as a shareable summary for judges and reviewers who want a clear explanation of the practical challenges and solutions behind the project.
