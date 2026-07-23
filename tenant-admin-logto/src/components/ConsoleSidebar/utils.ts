/** Maps a sidebar item key to its route (leading slash for Next.js links). */
export const getPath = (title: string) => `/${title.replace(/_/g, '-')}`;
