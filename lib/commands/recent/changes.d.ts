import { SfCommand } from '@salesforce/sf-plugins-core';
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
export default class Changes extends SfCommand<RecentChangesResult[]> {
    static readonly summary = "Visualize recently modified metadata and generate package.xml";
    static readonly description = "Retrieves metadata changes from the org and displays them in a table.";
    static readonly examples: string[];
    static readonly flags: {
        'target-org': import("@oclif/core/lib/interfaces").OptionFlag<import("@salesforce/core").Org, import("@oclif/core/lib/interfaces/parser").CustomOptions>;
        days: import("@oclif/core/lib/interfaces").OptionFlag<number, import("@oclif/core/lib/interfaces/parser").CustomOptions>;
        created: import("@oclif/core/lib/interfaces").BooleanFlag<boolean>;
        types: import("@oclif/core/lib/interfaces").OptionFlag<string, import("@oclif/core/lib/interfaces/parser").CustomOptions>;
        mine: import("@oclif/core/lib/interfaces").BooleanFlag<boolean>;
    };
    run(): Promise<RecentChangesResult[]>;
    private chunkArray;
}
