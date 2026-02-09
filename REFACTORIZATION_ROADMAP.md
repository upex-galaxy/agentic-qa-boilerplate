 REFACTORIZATION ROADMAP

 Purpose: Transform the repository from a specific project (Curacity + Coda) to a generic boilerplate with
  Jira/Xray as default TMS.
 Usage: Work on each task per session, update progress after completion.
 Last Updated: 2026-02-09 (Session 5)

 ---
 Progress Tracker

 | Phase | Task                          | Status      | Session Date |
 | ----- | ----------------------------- | ----------- | ------------ |
 | 1.1   | CLI & Utils (Xray + JiraSync) | [x] Completed | 2026-02-08   |
 | 1.2   | TMS Documentation             | [x] Completed | 2026-02-09   |
 | 1.3   | MCP Guides                    | [x] Completed | 2026-02-09   |
 | 2.1   | Remove Coda CLI & Utils       | [x] Completed | 2026-02-09   |
 | 2.2   | Transform Coda Docs to Jira   | [x] Completed | 2026-02-09   |
 | 3.1   | Config Files                  | [x] Completed | 2026-02-09   |
 | 3.2   | Context Cleanup               | [x] Completed | 2026-02-09   |
 | 3.3   | Guidelines Review             | [x] Completed | 2026-02-09   |
 | 3.4   | System Prompt Overhaul        | [x] Completed | 2026-02-09   |
 | 3.5   | Test Files Cleanup            | [x] Completed | 2026-02-09   |
 | 4.1   | Code References Coda→Jira     | [x] Completed | 2026-02-09   |
 | 4.2   | TAE Documentation Update      | [x] Completed | 2026-02-09   |
 | 4.3   | Prompts Update                | [x] Completed | 2026-02-09   |
 | 4.4   | Workflows & Other Files       | [x] Completed | 2026-02-09   |
 | 5.1   | Final Adjustments             | [x] Completed | 2026-02-09   |
 | 5.2   | README & CLAUDE.md            | [x] Completed | 2026-02-09   |

 ---
 Phase 1: Recover Files from Remote (Jira/Xray)

 Task 1.1: CLI & Utils

 Objective: Download and configure CLI tools for Xray and Jira sync.

 | Source (Remote)        | Destination (Local)     | Action              |
 | ---------------------- | ----------------------- | ------------------- |
 | cli/xray.ts            | cli/xray.ts             | Download and add    |
 | tests/utils/tmsSync.ts | tests/utils/jiraSync.ts | Download and rename |

 Extra Tasks:
 - Review jiraSync.ts code thoroughly
 - Verify sync logic is correct for Jira integration
 - Refine if necessary to ensure perfect functionality
 - Compare with codaSync.ts structure (not content) for consistency

 Notes: The file is renamed from tmsSync.ts to jiraSync.ts to match the naming convention of codaSync.ts.

 ---
 Task 1.2: TMS Documentation

 Objective: Download and refine TMS documentation.

 | Source (Remote)                                | Destination (Local) | Action
  |                                                |
  | ---------------------------------------------- | --------- | -------------------------------- |
  | -                                              |
  | .context/guidelines/QA/jira-test-management.md | Same path | Download (replaces coda version) |
  |                                                |
  | .context/guidelines/TAE/tms-integration.md     | Same path | Download and review              |
  |                                                |

 Extra Tasks:
 - Compare coda-test-management.md with jira-test-management.md before replacing
 - Identify improvements from Coda version that can enhance Jira version
 - Refine jira-test-management.md with best practices from Coda doc
 - Review tms-integration.md - check if current local version is more refined

 Important: Files from the Curacity project (local) are highly optimized. Remote files may need
 refinement.

 ---
 Task 1.3: MCP Guides

 Objective: Add essential MCP guides for any project.

 | MCP Guide     | Priority | Description                             |
 | ------------- | -------- | --------------------------------------- |
 | atlassian.md  | Critical | Jira/Confluence integration             |
 | dbhub.md      | Critical | Database connection for backend testing |
 | openapi.md    | Critical | API endpoints context for AI            |
 | playwright.md | Critical | Testing automation                      |
 | postman.md    | High     | API testing with Postman                |
 | context7.md   | High     | Research and documentation              |
 | tavily.md     | High     | Web research capabilities               |

 Extra Tasks:
 - Download all MCPs from remote if they exist
 - Create .context/guidelines/MCP/ directory if not exists
 - For playwright.md: Add section about MCP extension (connect to existing browser tab via token instead
 of launching new browser)
 - Review each MCP guide for completeness

 Notes: These MCPs are essential for any project using this boilerplate.

 ---
 Phase 2: Handle Coda-Specific Files

 Task 2.1: Remove Coda CLI & Utils

 Objective: Replace Coda tools with Jira/Xray equivalents.

 | File to Remove          | Replaced By             | Notes                |
 | ----------------------- | ----------------------- | -------------------- |
 | cli/coda.ts             | cli/xray.ts             | Already added in 1.1 |
 | tests/utils/codaSync.ts | tests/utils/jiraSync.ts | Already added in 1.1 |

 Action: Delete after confirming replacements work.

 ---
 Task 2.2: Transform Coda Docs to Jira Equivalents

 Objective: Create Jira versions based on Coda documentation analysis.

 | Coda File                                      | Action                    | New Jira File
    |                                                |
    | ---------------------------------------------- | ------------------------- | ------------------------- |
    | ---                                            |
    | .context/coda-setup-guide.md                   | Analyze, don't delete yet |
    | .context/jira-setup-guide.md                   |
    | .context/coda-platform.md                      | Analyze, don't delete yet | .context/jira-platform.md |
    |                                                |
    | .context/guidelines/QA/coda-test-management.md | Compare and delete        | Already replaced in 1.2   |
    |                                                |

 Extra Tasks:
 - Read coda-setup-guide.md thoroughly - understand structure and purpose
 - Read coda-platform.md thoroughly - understand topics covered
 - Use Tavily MCP to research Jira equivalents for each topic
 - Create jira-setup-guide.md following same structure
 - Create jira-platform.md with Jira-specific information
 - Delete Coda files only after Jira versions are complete

 Notes: These files provide essential TMS context. Must have Jira equivalents.

 ---
 Phase 3: Update Curacity References to Generic

 Task 3.1: Config Files

 Objective: Remove all Curacity-specific references from configuration.

 | File                        | Changes                                                    |
 | --------------------------- | ---------------------------------------------------------- |
 | package.json                | Change author, homepage, repository URLs to upex-galaxy    |
 | .mcp.json                   | DELETE entirely or create generic template with variables  |
 | .claude/settings.local.json | Clean MCP-specific references                              |
 | config/variables.ts         | Replace Curacity URLs with placeholders, keep code working |
 | dbhub.toml                  | DELETE (not tracked by git)                                |

 Extra Tasks:
 - For .mcp.json: Consider creating a template that users can customize via a prompt (e.g., "mcp setup")
 - For config/variables.ts: Only change URLs, don't break any code references
 - Document: User will provide DB connection guide for dbhub later
 - Verify .gitignore includes sensitive files

 Notes:
 - Never mention "Curacity" anywhere
 - URLs should be generic placeholders
 - Code must remain functional

 ---
 Task 3.2: Context Cleanup (Curacity-Specific Content)

 Objective: Remove project-specific documentation, keep structure.

 Directories to Clean (delete content, keep READMEs):

 | Directory      | Action                                                         |
 | -------------- | -------------------------------------------------------------- |
 | .context/PRD/  | Delete all files EXCEPT README.md, update README to be generic |
 | .context/SRS/  | Delete all files EXCEPT README.md, update README to be generic |
 | .context/idea/ | Delete all files EXCEPT README.md, update README to be generic |
 | .context/PBI/  | Delete all files EXCEPT README.md, update README to be generic |

 Files to Delete:
 - .context/business-data-map.md
 - .context/api-architecture.md
 - .context/project-test-guide.md
 - .context/project-config.md

 Notes:
 - These files are generated by prompts, not manually maintained
 - READMEs should explain what files will be generated and by which prompts
 - Guidelines directory is NOT touched here (separate task)

 ---
 Task 3.3: Guidelines Review

 Objective: Review all guidelines for Curacity/Coda references.

 Files to Review and Update:

 | Directory                             | Files     | Notes                       |
 | ------------------------------------- | --------- | --------------------------- |
 | .context/guidelines/TAE/              | All files | Update Coda→Jira references |
 | .context/guidelines/QA/               | All files | Update Coda→Jira references |
 | .context/guidelines/code-standards.md | Review    | Should be generic           |
 | .context/guidelines/mcp-usage-tips.md | Update    | Remove Coda CLI references  |
 | .context/guidelines/README.md         | Update    | Reflect new structure       |

 Extra Tasks:
 - Check each guideline for Curacity mentions
 - Check each guideline for Coda mentions
 - Ensure all guidelines are project-agnostic
 - Verify MCP guides added in 1.3 are referenced in README

 ---
 Task 3.4: System Prompt Overhaul

 Objective: Significantly improve the system prompt.

 Files:
 - .context/system-prompt.md
 - .context/test-management-system.md

 Extra Tasks:
 - Read current system-prompt.md thoroughly
 - Check if there's a prompt that generates README and CLAUDE.md
 - Determine if system-prompt.md is needed or if README/CLAUDE.md serve this purpose
 - Major improvement needed - make it comprehensive and generic
 - Update test-management-system.md for Jira/Xray (significant work)

 Notes: This is a large task requiring careful analysis of how system prompts interact with generated
 files.

 ---
 Task 3.5: Test Files Cleanup

 Objective: Remove Curacity mentions while keeping code as real-world example.

 | File                                  | Action                                          |
 | ------------------------------------- | ----------------------------------------------- |
 | tests/data/types.ts                   | Remove "Curacity" from comments, keep structure |
 | tests/data/DataFactory.ts             | Remove "Curacity" from comments, keep structure |
 | tests/e2e/dashboard/dashboard.test.ts | Remove "Curacity" from comments                 |

 Notes:
 - Keep code as example of real project structure
 - Only remove the business name, not the example code
 - Use generic terms like "Example Project" or "Your Project"

 ---
 Phase 4: Update Coda → Jira/Xray References

 Task 4.1: Code References

 Objective: Update all code files with Coda references.

 | File                  | Changes                                       |
 | --------------------- | --------------------------------------------- |
 | config/variables.ts   | Change CODA_* env vars to XRAY_* / JIRA_*     |
 | config/validateEnv.ts | Update validation for Xray/Jira variables     |
 | package.json          | Update scripts: coda → xray, test:sync update |
 | .env.example          | Replace all CODA_* with XRAY_* / JIRA_*       |

 ---
 Task 4.2: TAE Documentation Update

 Objective: Update all TAE guidelines for Jira/Xray.

 | File                                            | Changes                                 |
 | ----------------------------------------------- | --------------------------------------- |
 | .context/guidelines/TAE/automation-standards.md | Coda → Jira/Xray                        |
 | .context/guidelines/TAE/kata-architecture.md    | Coda → Jira/Xray                        |
 | .context/guidelines/TAE/ci-cd-integration.md    | Coda → Jira/Xray                        |
 | .context/guidelines/TAE/KATA-AI-GUIDE.md        | Coda → Jira/Xray                        |
 | .context/guidelines/TAE/data-testid-usage.md    | Coda → Jira/Xray                        |
 | .context/guidelines/TAE/tms-integration.md      | Full review (already downloaded in 1.2) |

 ---
 Task 4.3: Prompts Update

 Objective: Update all prompts for Jira/Xray workflow.

 | Directory/File                      | Changes                      |
 | ----------------------------------- | ---------------------------- |
 | .prompts/stage-1-shift-left/*.md    | "Coda key" → "Jira/Xray key" |
 | .prompts/stage-3-documentation/*.md | TMS references               |
 | .prompts/stage-4-automation/*.md    | Sync references              |
 | .prompts/utilities/*.md             | Tool references              |
 | .prompts/us-qa-workflow.md          | Workflow update              |
 | .prompts/README.md                  | Overview update              |

 ---
 Task 4.4: Workflows & Other Files

 Objective: Update CI/CD and other configuration files.

 | File                    | Changes                                      |
 | ----------------------- | -------------------------------------------- |
 | .github/workflows/*.yml | TMS_PROVIDER from "coda" to "xray" or "jira" |
 | context-engineering.md  | Update Coda references                       |

 ---
 Phase 5: Final Adjustments

 Task 5.1: Final Cleanup

 Objective: Final verification and cleanup.

 Checklist:
 - Create .context/guidelines/MCP/ directory (if not done in 1.3)
 - Update .context/README.md with new structure
 - Verify .gitignore includes all sensitive files
 - Delete dbhub.toml (user will provide connection guide)
 - Search entire repo for "Curacity" - should return 0 results
 - Search entire repo for "Coda" (excluding historical context) - should return 0 results
 - Run bun install to verify dependencies work
 - Run type check if available

 Extra Tasks:
 - User will provide: Documentation for DB connection with dbhub MCP via connection string + mcp.json +
 dbhub.toml combination

 ---
 Task 5.2: README & CLAUDE.md (LAST)

 Objective: Rewrite main documentation files.

 | File      | Action                                                |
 | --------- | ----------------------------------------------------- |
 | README.md | Complete rewrite as generic boilerplate               |
 | CLAUDE.md | Complete rewrite with generic project memory template |

 Notes:
 - This is intentionally LAST because it depends on all other changes
 - README should explain the boilerplate purpose and how to use it
 - CLAUDE.md should be a template showing how to document any project

 ---
 Session Workflow

 Before Each Session

 1. Read this roadmap file
 2. Identify which task to work on
 3. Load relevant context files mentioned in the task

 During Session

 1. Complete all items in the task
 2. Complete extra tasks if time permits
 3. Document any issues or decisions made

 After Each Session

 1. Update the Progress Tracker table at the top
 2. Mark completed tasks with [x]
 3. Add session date
 4. Add any notes or blockers discovered
 5. Generate brief session report

 ---
 Notes & Decisions

 User Decisions

 - Curacity Docs: Delete all (PRD, SRS, idea, etc.) - keep only READMEs
 - MCP Guides: Add essential ones (atlassian, dbhub, openapi, playwright, postman, context7, tavily)
 - Coda Setup/Platform: Don't delete immediately - use for research to create Jira equivalents

 Key Principles

 - Never mention "Curacity" anywhere in final version
 - All guidelines must remain (they're project-agnostic)
 - Files in PRD/SRS/idea/PBI are generated by prompts - only keep READMEs
 - Remote files may need refinement based on local (optimized) versions
 - README.md and CLAUDE.md are updated LAST

 Pending from User

 - DB connection documentation (dbhub MCP + connection string guide)
 - Mini project for boilerplate to point to for testing

 ---
 Files Reference

 Critical Files to Read Before Implementation

 - config/variables.ts - Understand current config structure
 - package.json - See existing scripts
 - .env.example - See current environment variables
 - tests/utils/codaSync.ts - Understand sync structure
 - .context/coda-setup-guide.md - Understand for Jira equivalent
 - .context/coda-platform.md - Understand for Jira equivalent
