export type NewsDate = {
  date: string;
};

export type NewsBody = {
  imageUrl?: string;
  headline: string;
  dek: string;
  generatedAt: string;
};

export type NewsSource = {
  title: string;
  outlet: string;
  url: string;
};

export type NewsEntry = {
  date: NewsDate;
  news: NewsBody;
  sources: NewsSource[];
};
