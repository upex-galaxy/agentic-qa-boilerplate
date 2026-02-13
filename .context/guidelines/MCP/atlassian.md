# Atlassian MCP (Jira + Confluence)

> **Type**: Project Management & Test Management
> **Roles**: QA, TAE
> **Priority**: Critical

---

## When to Use

- Synchronize test cases with Jira/Xray
- Create issues or test cases automatically
- Read requirements from Confluence
- Update ticket status
- Link automated tests to Jira tickets

---

## Usage Examples

### Test Planning

```
"Create a Jira issue for this story"
"Read the requirements from Confluence document ABC-123"
"What is the status of ticket PROJ-456?"
"List all test cases linked to STORY-123"
```

### Test Documentation

```
"Create a Test issue linked to STORY-123"
"Update the status of TEST-456 to 'Pass'"
"Add test steps to the test case"
"Sync test results to Xray"
```

### Test Automation Integration

```
"Link the automated test to the Jira ticket"
"Update the 'Automated' field to Yes"
"Report test execution results to Xray"
```

---

## DO NOT Use For

- ❌ Tasks you can do directly in Jira web
- ❌ Bulk operations (use Jira API directly)
- ❌ Complex reports (use Jira dashboards)

---

## CLI Integration

This boilerplate includes CLI tools for Xray:

```bash
# Import test results to Xray
bun xray import

# Export test cases from Xray
bun xray export

# Sync test execution
bun xray sync
```

See `cli/xray.ts` for available commands.

---

## Jira/Xray Workflow

This project supports **Jira-First workflow**:

1. Create issue in Jira → Get real ticket ID
2. Create test cases linked to the issue
3. Run automated tests
4. Sync results back to Jira/Xray

See `.context/guidelines/QA/jira-test-management.md` for details.

---

## Tips

1. **Real IDs Only**: Always use actual Jira IDs, never make them up
2. **Bidirectional Links**: Link Jira ↔ code/tests for traceability
3. **Status Sync**: Keep ticket status in sync with test reality
4. **Test Keys**: Use Xray test keys for automation linking

---

## Related Documentation

- `../QA/jira-test-management.md` - Jira test management guide
- `../TAE/tms-integration.md` - TMS integration for automation
- `cli/xray.ts` - Xray CLI commands
- `tests/utils/jiraSync.ts` - Jira sync utilities

---

**Last Updated**: 2026-02-12
