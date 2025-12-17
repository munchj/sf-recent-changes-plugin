"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const sf_plugins_core_1 = require("@salesforce/sf-plugins-core");
const core_1 = require("@salesforce/core");
const date_fns_1 = require("date-fns");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
core_1.Messages.importMessagesDirectory(__dirname);
const DEFAULT_METADATA_TYPES = [
    "ApexClass",
    "ApexTrigger",
    "AuraDefinitionBundle",
    "CustomField",
    "CustomObject",
    "CustomTab",
    "FlexiPage",
    "Flow",
    "GlobalValueSet",
    "Layout",
    "LightningComponentBundle",
    "ListView",
    "QuickAction",
    "RecordType",
    "ValidationRule"
];
class Changes extends sf_plugins_core_1.SfCommand {
    async run() {
        const { flags } = await this.parse(Changes);
        const conn = flags['target-org'].getConnection(undefined);
        const days = flags.days;
        const created = flags.created;
        const mine = flags.mine;
        let typesArg = flags.types;
        let metadataTypes = [];
        if (typesArg && typesArg.toLowerCase() === 'all') {
            this.spinner.start('Fetching all metadata types from org');
            try {
                const describeResult = await conn.metadata.describe(conn.getApiVersion());
                metadataTypes = describeResult.metadataObjects.map(obj => obj.xmlName);
                this.spinner.stop(`Found ${metadataTypes.length} types`);
            }
            catch (e) {
                this.error(`Failed to fetch metadata types: ${e.message}`);
            }
        }
        else if (typesArg) {
            metadataTypes = typesArg.split(',').map(t => t.trim());
        }
        else {
            metadataTypes = DEFAULT_METADATA_TYPES;
        }
        let currentUserDisplayName;
        if (mine) {
            try {
                const identity = await conn.identity();
                // We need the display name to match against createdByName/lastModifiedByName
                // The identity returns user_id, we might need to query User table
                const userRecord = await conn.singleRecordQuery(`SELECT Name FROM User WHERE Id = '${identity.user_id}'`);
                currentUserDisplayName = userRecord.Name;
                this.log(`Filtering for user: ${currentUserDisplayName}`);
            }
            catch (e) {
                this.warn(`Could not determine current user: ${e.message}`);
            }
        }
        this.spinner.start(`Checking for metadata changes in the last ${days} days`);
        const summary = [];
        const newManifestMap = {};
        // Chunk metadata types because list() accepts max 3 queries
        const chunks = this.chunkArray(metadataTypes, 3);
        for (const chunk of chunks) {
            const queries = chunk.map(type => ({ type }));
            try {
                const results = await conn.metadata.list(queries, conn.getApiVersion());
                if (!results)
                    continue;
                // results can be a single object or array
                const resultArray = Array.isArray(results) ? results : [results];
                for (const obj of resultArray) {
                    if (!obj)
                        continue;
                    const now = new Date();
                    const lastModifiedDate = new Date(obj.lastModifiedDate);
                    const createdDate = new Date(obj.createdDate);
                    const modificationAge = (0, date_fns_1.differenceInDays)(now, lastModifiedDate);
                    const creationAge = (0, date_fns_1.differenceInDays)(now, createdDate);
                    const diff = created ? creationAge : modificationAge;
                    if (diff <= days) {
                        if (mine && currentUserDisplayName) {
                            const userToCheck = created ? obj.createdByName : obj.lastModifiedByName;
                            if (userToCheck !== currentUserDisplayName) {
                                continue;
                            }
                        }
                        if (!newManifestMap[obj.type]) {
                            newManifestMap[obj.type] = [];
                        }
                        newManifestMap[obj.type].push(obj.fullName);
                        summary.push({
                            type: obj.type,
                            name: obj.fullName,
                            modificationAge,
                            creationAge,
                            lastModifiedDate: obj.lastModifiedDate,
                            createdDate: obj.createdDate,
                            lastModifiedByName: obj.lastModifiedByName,
                            createdByName: obj.createdByName
                        });
                    }
                }
            }
            catch (e) {
                // Some types might fail or not be listable, just log debug
                // this.debug(`Error listing metadata for ${chunk.join(',')}: ${e.message}`);
            }
        }
        this.spinner.stop();
        if (summary.length > 0) {
            this.log('\n=== Recently Modified Metadata ===');
            // Group by Type
            const groupedSummary = summary.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {});
            Object.keys(groupedSummary).sort().forEach(type => {
                this.log(`\n--- ${type} ---`);
                this.table(groupedSummary[type].sort((a, b) => created ? a.creationAge - b.creationAge : a.modificationAge - b.modificationAge), {
                    name: { header: 'Name' },
                    [created ? 'creationAge' : 'modificationAge']: { header: created ? 'Cr. Age' : 'Mod. Age' },
                    [created ? 'createdDate' : 'lastModifiedDate']: { header: created ? 'Cr. Date' : 'Mod. Date' },
                    [created ? 'createdByName' : 'lastModifiedByName']: { header: created ? 'Cr. By' : 'Mod. By' },
                });
            });
        }
        else {
            this.log('\nNo metadata changes found in the specified period.');
        }
        // Build manifest
        if (Object.keys(newManifestMap).length > 0) {
            let newManifest = `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n`;
            Object.keys(newManifestMap).sort().forEach((key) => {
                let members = newManifestMap[key].sort();
                newManifest += `    <types>\n`;
                members.forEach((member) => {
                    newManifest += `        <members>${member}</members>\n`;
                });
                newManifest += `        <name>${key}</name>\n`;
                newManifest += `    </types>\n`;
            });
            newManifest += `    <version>${conn.getApiVersion()}</version>\n</Package>\n`;
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir);
            }
            fs.writeFileSync(path.join(outputDir, 'new.xml'), newManifest);
            this.log(`\nGenerated ${path.join(outputDir, 'new.xml')}`);
        }
        return summary;
    }
    chunkArray(array, size) {
        const chunked = [];
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    }
}
Changes.summary = 'Visualize recently modified metadata and generate package.xml';
Changes.description = 'Retrieves metadata changes from the org and displays them in a table.';
Changes.examples = [
    '<%= config.bin %> <%= command.id %> --target-org my-org --days 7',
    '<%= config.bin %> <%= command.id %> --target-org my-org --types all',
    '<%= config.bin %> <%= command.id %> --target-org my-org --mine',
];
Changes.flags = {
    'target-org': sf_plugins_core_1.Flags.requiredOrg({
        char: 'o',
        summary: 'The org to connect to',
        required: true,
    }),
    days: sf_plugins_core_1.Flags.integer({
        char: 'd',
        summary: 'Number of days to look back',
        default: 15,
    }),
    created: sf_plugins_core_1.Flags.boolean({
        char: 'c',
        summary: 'Filter by created date instead of last modified date',
        default: false,
    }),
    types: sf_plugins_core_1.Flags.string({
        char: 't',
        summary: 'Comma-separated list of metadata types to check, or "all"',
        default: '',
    }),
    mine: sf_plugins_core_1.Flags.boolean({
        char: 'm',
        summary: 'Only show changes made by the current user',
        default: false,
    }),
};
exports.default = Changes;
//# sourceMappingURL=changes.js.map