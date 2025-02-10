export enum SortOrder {
	ASC = 'asc',
	DESC = 'desc',
}

export interface PluginSettings {
	tagPageDir: string;
	frontmatterQueryProperty: string;
	sortByDate: SortOrder;
	nestedSeparator: string;
	bulletedSubItems: boolean;
	includeLines: boolean;
	autoRefresh: boolean;
	fullLinkName: boolean;
}

export type TagInfo = Map<string, TagMatchDetail[]>;

export interface TagMatchDetail {
	stringContainingTag: string;
	fileLink: string;
	timestamp: number; // pulled from TFile.stat.ctime (creation time)
}
