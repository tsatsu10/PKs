type Props = { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } };

export default function LoadMore({ query }: Props) {
  if (!query.hasNextPage) return null;
  return (
    <div className="load-more">
      <button type="button" className="btn btn-secondary" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
        {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
