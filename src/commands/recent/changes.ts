import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { differenceInDays } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';

Messages.importMessagesDirectory(__dirname);
// const messages = Messages.loadMessages('sf-recent-changes-plugin', 'recent.changes');

export type RecentChangesResult = {
  type: string;
  name: string;
  modificationAge: number;
  creationAge: number;
  lastModifiedDate: string;
  createdDate: string;
  lastModifiedByName: string;
  createdByName: string;
};

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

export default class Changes extends SfCommand<RecentChangesResult[]> {
  public static readonly summary = 'Visualize recently modified metadata and generate package.xml';
  public static readonly description = 'Retrieves metadata changes from the org and displays them in a table.';
  public static readonly examples = [
    '<%= config.bin %> <%= command.id %> --target-org my-org --days 7',
    '<%= config.bin %> <%= command.id %> --target-org my-org --types all',
    '<%= config.bin %> <%= command.id %> --target-org my-org --mine',
  ];

  public static readonly flags = {
    'target-org': Flags.requiredOrg({
      char: 'o',
      summary: 'The org to connect to',
      required: true,
    }),
    days: Flags.integer({
      char: 'd',
      summary: 'Number of days to look back',
      default: 15,
    }),
    created: Flags.boolean({
      char: 'c',
      summary: 'Filter by created date instead of last modified date',
      default: false,
    }),
    types: Flags.string({
      char: 't',
      summary: 'Comma-separated list of metadata types to check, or "all"',
      default: '',
    }),
    mine: Flags.boolean({
      char: 'm',
      summary: 'Only show changes made by the current user',
      default: false,
    }),
  };

  public async run(): Promise<RecentChangesResult[]> {
    const { flags } = await this.parse(Changes);
    const conn = flags['target-org'].getConnection(undefined);
    const days = flags.days;
    const created = flags.created;
    const mine = flags.mine;
    let typesArg = flags.types;

    let metadataTypes: string[] = [];

    if (typesArg && typesArg.toLowerCase() === 'all') {
      this.spinner.start('Fetching all metadata types from org');
      try {
        const describeResult = await conn.metadata.describe(conn.getApiVersion());
        metadataTypes = describeResult.metadataObjects.map(obj => obj.xmlName);
        this.spinner.stop(`Found ${metadataTypes.length} types`);
      } catch (e: any) {
        this.error(`Failed to fetch metadata types: ${e.message}`);
      }
    } else if (typesArg) {
      metadataTypes = typesArg.split(',').map(t => t.trim());
    } else {
      metadataTypes = DEFAULT_METADATA_TYPES;
    }

    let currentUserDisplayName: string | undefined;
    if (mine) {
      try {
        const identity = await conn.identity();
        // We need the display name to match against createdByName/lastModifiedByName
        // The identity returns user_id, we might need to query User table
        const userRecord = await conn.singleRecordQuery<{ Name: string }>(`SELECT Name FROM User WHERE Id = '${identity.user_id}'`);
        currentUserDisplayName = userRecord.Name;
        this.log(`Filtering for user: ${currentUserDisplayName}`);
      } catch (e: any) {
        this.warn(`Could not determine current user: ${e.message}`);
      }
    }

    this.spinner.start(`Checking for metadata changes in the last ${days} days`);

    const summary: RecentChangesResult[] = [];
    const newManifestMap: Record<string, string[]> = {};

    // Chunk metadata types because list() accepts max 3 queries
    const chunks = this.chunkArray(metadataTypes, 3);

    for (const chunk of chunks) {
      const queries = chunk.map(type => ({ type }));
      try {
        const results = await conn.metadata.list(queries, conn.getApiVersion());
        if (!results) continue;
        
        // results can be a single object or array
        const resultArray = Array.isArray(results) ? results : [results];

        for (const obj of resultArray) {
          if (!obj) continue;
          
          const now = new Date();
          const lastModifiedDate = new Date(obj.lastModifiedDate);
          const createdDate = new Date(obj.createdDate);
          
          const modificationAge = differenceInDays(now, lastModifiedDate);
          const creationAge = differenceInDays(now, createdDate);
          
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
      } catch (e: any) {
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
      }, {} as Record<string, RecentChangesResult[]>);

      Object.keys(groupedSummary).sort().forEach(type => {
        this.log(`\n--- ${type} ---`);
        this.table(
          groupedSummary[type].sort((a, b) => created ? a.creationAge - b.creationAge : a.modificationAge - b.modificationAge),
          {
            name: { header: 'Name' },
            [created ? 'creationAge' : 'modificationAge']: { header: created ? 'Cr. Age' : 'Mod. Age' },
            [created ? 'createdDate' : 'lastModifiedDate']: { header: created ? 'Cr. Date' : 'Mod. Date' },
            [created ? 'createdByName' : 'lastModifiedByName']: { header: created ? 'Cr. By' : 'Mod. By' },
          }
        );
      });
    } else {
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

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  }
}
