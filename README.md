> **Warning**
> This project was mostly generated using GitHub Copilot.

# sf-recent-changes-plugin

A Salesforce CLI plugin to visualize recently modified metadata in your org and automatically generate a `package.xml` manifest for retrieval.

## Description

This plugin helps developers and admins quickly identify what has changed in a Salesforce organization within a specified timeframe. It displays a summary table of modified (or created) metadata components and generates a `package.xml` file (defaulting to the current directory), which can be used to retrieve the changes using `sf project retrieve`.

## Installation

To install this plugin, link it to your Salesforce CLI:

```bash
sf plugins link .
```

## Usage

```bash
sf recent changes -o <org-alias> [flags]
```

## Flags

| Flag | Char | Description | Default |
|---|---|---|---|
| `--target-org` | `-o` | **(Required)** The alias or username of the org to connect to. | |
| `--days` | `-d` | Number of days to look back for changes. | `15` |
| `--created` | `-c` | Filter by **Created Date** instead of **Last Modified Date**. | `false` |
| `--types` | `-t` | Comma-separated list of metadata types to check (e.g., `CustomObject,Flow`), or `all` to check all available types in the org. | (Default list*) |
| `--mine` | `-m` | Only show changes made by the current user. | `false` |
| `--output-dir` | | Directory to save the generated `package.xml`. | `.` |
| `--json` | | Format output as JSON. | |

*> The default list includes: ApexClass, ApexTrigger, AuraDefinitionBundle, CustomField, CustomObject, CustomTab, FlexiPage, Flow, GlobalValueSet, Layout, LightningComponentBundle, ListView, QuickAction, RecordType, ValidationRule.*

## Examples

### Basic Usage
Check for changes in the last 15 days (default) in the org `my-org`:
```bash
sf recent changes -o my-org
```

### Check Last 3 Days
```bash
sf recent changes -o my-org --days 3
```

### Filter by Current User
Show only changes made by the currently logged-in user:
```bash
sf recent changes -o my-org --mine
```

### Check All Metadata Types
By default, the plugin checks a common subset of metadata types. To check **everything** available in the org (slower):
```bash
sf recent changes -o my-org --types all
```

### Check Specific Types
```bash
sf recent changes -o my-org --types CustomObject,Flow,ApexClass
```

### Check Created Date
Find components created (instead of modified) in the last 30 days:
```bash
sf recent changes -o my-org --days 30 --created
```

### Specify Output Directory
Generate the `package.xml` in a specific folder:
```bash
sf recent changes -o my-org --output-dir ./manifests
```

## Output

1.  **Console Table**: Displays a grouped list of changed components with their age, date, and user.
2.  **Manifest File**: Generates `package.xml` (in the current directory or specified `output-dir`) containing the structure for the found changes.

You can use the generated manifest to retrieve the metadata:
```bash
sf project retrieve start -x package.xml -o my-org
```
