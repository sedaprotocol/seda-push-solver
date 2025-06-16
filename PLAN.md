# PLAN.md

## Goal

**The goal of this application is to keep the existing functionality and extend it.**

- **Current functionality:** Every N seconds, the application queries data from the SEDA network and tracks the results. This part is already working and must be preserved.
- **New functionality to add:** After results are tracked from SEDA, these results must be pushed to EVM chains (e.g., Base, and later other L2s). The new work is to add this EVM result pushing logic, without breaking or regressing the existing SEDA querying/tracking logic.

Be extremely careful to maintain all current SEDA polling, tracking, and result management as-is. The extension is to add the EVM result pushing as a new, robust, and well-tested feature.

---

## 1. **Preparation and Cleanup**

### 1.1. Remove Redundant and Legacy Code
- Audit the entire codebase for:
  - Unused files, functions, and types. Remove them.
  - Debug logs, commented-out code, and any leftover development artifacts. Remove them.
  - Redundant logic, duplicate code, or re-imports for backwards compatibility. Remove or refactor for clarity.
  - Any code not aligned with the new goal (pushing results to EVM chains). Remove or refactor.
- **Do not remove or break any code related to the existing SEDA polling/tracking/result logic.**
- Search for and resolve all TODOs by implementing the intended logic. Do not leave new TODOs.
- Remove unused dependencies from `package.json` and lock files. Run dependency audits to ensure no unused packages remain.
- **After this step:** Run all existing tests and manually verify the application still starts and runs. Fix any issues before proceeding.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 1.2. Refactor for Clarity
- Move misplaced types to a dedicated `types/` directory or co-locate with relevant modules.
- Split files that are too large or contain unrelated logic into smaller, logically organized files.
- Rename files and directories for clarity and professionalism (e.g., use `evm-networks` for EVM-related code, avoid names like "final" or "consolidated").
- Remove any compatibility layers, legacy exports, or deprecated APIs.
- Ensure all code is well-commented and easy to follow.
- **Do not refactor away or break the SEDA polling/tracking/result logic.**
- **After this step:** Run all tests and manually verify the application. Fix any issues.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

---

## 2. **Configuration Consolidation**

### 2.1. Create a Root Config File
- Create `config.ts` at the root of the repo.
- Define a `SedaConfig` interface/type for all SEDA network and interval settings (e.g., RPC, polling intervals, contract addresses, etc).
- Define an `EvmNetworkConfig` interface/type for EVM network settings (e.g., name, RPC URL, contract address, chainId, etc).
- The config file should export:
  - `sedaConfig: SedaConfig`
  - `evmNetworks: EvmNetworkConfig[]`
- Use strong TypeScript typing and include JSDoc comments for all fields.
- Add a comment block at the top listing all required environment variables and their purpose.
- **After this step:** Remove all previous config files and update all code to use the new config. Run tests and verify the application loads config correctly.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 2.2. Environment Variables
- Move all sensitive data (private keys, RPC keys, etc.) to `.env`.
- Use Bun's built-in `process.env` to load these at startup. Validate that all required env vars are present at startup and fail fast if not.
- Document required env variables at the top of `config.ts` and in the README.
- **After this step:** Test that secrets are loaded correctly and not accidentally committed. Run the application with a sample `.env` file.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 2.3. Remove Old Configs
- Delete all previous config files and references throughout the codebase.
- Refactor all code to use the new consolidated config structure.
- **After this step:** Run all tests and verify the application still works as expected.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

---

## 3. **EVM Integration Logic (Extension)**

**This section is about extending the application. The existing SEDA polling/tracking/result logic must remain untouched and working.**

### 3.1. EVM Network Abstraction
- Create a new directory `src/evm-networks/`.
- For each EVM network in the config:
  - Implement logic to connect using the provided RPC and credentials.
  - Load the contract ABI (copy from `@/solver-sdk` if needed, but do not import).
  - Implement a class or module to encapsulate contract interaction (e.g., `EvmResultPoster`).
  - Ensure the abstraction is extensible for future EVM networks.
- **After this step:** Write unit tests for the abstraction and run them. Manually test connection to at least one EVM network.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 3.2. Result Posting Logic
- **After the SEDA polling/tracking logic has obtained a result,** implement logic to:
  - Post the result individually to the appropriate EVM chain(s) using the abstraction.
  - Implement basic retry logic (e.g., up to 3 attempts with exponential backoff). Log all attempts, successes, and failures with clear, professional messages.
  - Ensure errors are handled gracefully and do not crash the main process.
  - Make the logic modular and extensible for future EVM networks or posting strategies.
- **Do not change or break the SEDA polling/tracking logic. Only extend it to push results to EVM chains.**
- **After this step:** Write unit tests for posting and retry logic. Manually test posting to a testnet contract.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 3.3. Reference SEDA Batch Logic
- Use the batch/result logic in `@/solver-sdk` as a reference for:
  - How batches are fetched and processed.
  - How results are formatted and verified.
- Do not import code directly; copy and adapt as needed. Ensure all code is idiomatic and fits the new structure.
- **After this step:** Write tests for any new or adapted logic. Manually verify batch/result processing.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

---

## 4. **Testing**

### 4.1. Unit Tests
- Write unit tests for all new logic, especially:
  - EVM posting logic (mocking EVM providers).
  - Config loading and validation.
  - Retry and error handling.
- Use `bun:test` as the test runner. Ensure all tests are passing before moving on.
- **After this step:** Review test coverage and add tests for any uncovered new logic.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 4.2. Manual/Integration Testing
- After each major step, run the project and verify:
  - It starts up and runs as expected.
  - Results are posted to EVM chains (mock or testnet).
  - No unused code or debug logs remain.
- Fix any issues before proceeding to the next step.
- **After this step:** Document any manual testing steps and results.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

---

## 5. **Documentation and Final Review**

### 5.1. Update README
- Document the new config structure and required environment variables.
- Provide usage instructions for running the binary and configuring networks.
- Add a section on how to extend the system for new EVM networks.
- **After this step:** Proofread the README for clarity and completeness.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 5.2. Final Code Review
- Check for:
  - Redundant logic or code.
  - Unused files, types, or dependencies.
  - Professional naming and comments.
  - Logical file and directory structure.
- Remove any remaining bloat or legacy code.
- **After this step:** Run a final test and manual check of the application.
- **Reference 5.3 (PLAN.md alignment) at the end of this step.**

### 5.3. Reference PLAN.md (Alignment Check)
- **At the end of every step, and before moving to the next, review this PLAN.md to ensure all requirements and intentions are being met.**
- If any ambiguity or uncertainty arises, clarify by referencing the plan and the project's intended purpose.
- If a step is unclear or seems misaligned, pause and seek clarification before proceeding.

---

## 6. **Ongoing Maintenance**

- Ensure all new code is clean, well-typed, and documented.
- Do not introduce new TODOs; solve issues as they arise.
- Keep the codebase lean and focused on the core goal: pushing SEDA results to EVM chains.
- Periodically review the codebase for bloat, legacy code, or drift from the PLAN.md.

---

**End of PLAN.md** 