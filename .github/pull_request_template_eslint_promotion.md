## ESLint Rule Promotion

**Rules**: {{ rules_list }}
**Detection Date**: {{ detection_timestamp }}
**Total Candidates**: {{ candidate_count }}
**Files**: {{ file_count }}

---

## Promotion Overview

This PR promotes the following ESLint rules from `warn` to `error` for files that are already clean:

{{#each rules}}

- **{{this}}**: {{rule_description}}
  {{/each}}

All files listed have been verified to have zero violations for these rules.

---

## Files Ready for Promotion

| File                 | Rule     | Current Status | Last Modified    |
| -------------------- | -------- | -------------- | ---------------- |
| {{#each candidates}} |          |                |                  |
| `{{file}}`           | {{rule}} | ✅ Clean       | {{lastModified}} |
| {{/each}}            |          |                |                  |

### Summary Statistics

- **Total Files**: {{totalFiles}}
- **Rules Affected**: {{rulesAffected}}
- **Test Coverage**: {{testCoverageStatus}}

---

## Review Checklist

### Code Review

- [ ] All files are appropriate for stricter rule enforcement
- [ ] No false positives expected based on file patterns
- [ ] Files not part of generated/vendor/build outputs
- [ ] Recent changes indicate active maintenance

### Testing Considerations

- [ ] CI/CD pipeline will catch any new violations
- [ ] Manual testing planned for affected areas
- [ ] Rollback plan understood by team

### Project Impact

- [ ] Documentation updates needed
- [ ] Team notification required
- [ ] Migration timeline acceptable

---

## Safety & Rollback

### Backup Information

- Original configuration backed up to: `.eslintrc.json.bak-{{date}}`
- Backup includes all original overrides and configurations

### Rollback Procedure

If issues arise after merge:

1. Revert this PR
2. Run: `cp .eslintrc.json.bak-{{date}} .eslintrc.json`
3. Commit and push the rollback
4. Notify team of rollback reason

### Emergency Contacts

- **Primary**: {{primary_reviewer}}
- **Secondary**: {{secondary_reviewer}}

---

## Additional Information

### Previous Promotions

{{#if previousPromotions}}
Recent rule promotions:
{{#each previousPromotions}}

- {{date}}: {{rules}} (Status: {{status}})
  {{/each}}
  {{else}}
  This appears to be the first automated rule promotion.
  {{/if}}

### Next Steps

1. **Review**: Team review within 2 business days
2. **Testing**: Optional local testing with stricter rules
3. **Merge**: Merge after approval and testing
4. **Monitor**: Watch for unexpected violations in CI

### Related Issues

{{#if relatedIssues}}

- {{relatedIssues}}
  {{else}}
  None at this time.
  {{/if}}

---

## Template Variables Reference

The following variables will be automatically replaced in the workflow:

- `{{rules_list}}` - Comma-separated list of promoted rules
- `{{detection_timestamp}}` - When detection was run
- `{{candidate_count}}` - Number of files found
- `{{file_count}}` - Unique file count
- `{{date}}` - Current date for backup naming
- `{{primary_reviewer}}` - Default reviewer assignment
- `{{secondary_reviewer}}` - Backup reviewer
- `{{totalFiles}}` - Total number of files
- `{{rulesAffected}}` - Number of rules affected
- `{{testCoverageStatus}}` - Test coverage status
- `{{previousPromotions}}` - Array of previous promotions
- `{{relatedIssues}}` - Related issue references

## Usage in Workflow

To use this template, modify your `create-pull-request` action to specify the template:

```yaml
- name: Create promotion PR
  uses: peter-evans/create-pull-request@v5
  with:
      # ... other parameters ...
      pull-request-title: "feat: Promote ESLint rules {{rules_list}}"
      pull-request-body: "" # Body will be populated from template
      pull-request-template: .github/pull_request_template_eslint_promotion.md
```
