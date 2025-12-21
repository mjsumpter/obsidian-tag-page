export enum SortOrder {
	ASC = 'asc',
	DESC = 'desc',
}

export interface PluginSettings {
	tagPageDir: string;
	sortByDate: SortOrder;
	nestedSeparator: string;
	tagPageTitleTemplate: string;
	bulletedSubItems: boolean;
	includeLines: boolean;
	fullLinkName: boolean;
	linkAtEnd: boolean;
	legacyFrontmatterQueryProperty?: string;
}

export type TagInfo = Map<string, TagMatchDetail[]>;

export interface TagMatchDetail {
	stringContainingTag: string;
	fileLink: string;
	timestamp: number; // pulled from TFile.stat.ctime (creation time)
}
