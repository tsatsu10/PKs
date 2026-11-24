import TimelineRow from './Views/TimelineRow';
import StreamBucketHeader from './Views/StreamBucketHeader';
import TableViewRow from './Views/TableView';
import DashboardObjectCard from './DashboardObjectCard';

/**
 * The dashboard's object list in its three views. It scrolls with the page: rows are virtualized
 * against the window (M5), and each row says where it sits in the whole filtered result (A10).
 */
export default function DashboardObjectList({
  listScrollRef, listVirtualizer, scrollMargin, objects, viewMode, listDensity, cardColumns,
  streamItems, selectedIds, toggleSelect, selectionMode, runPromptSuffix, totalCount, positionOffset = 0,
}) {
  const rowStyle = (virtualRow) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: `${virtualRow.size}px`,
    transform: `translateY(${virtualRow.start - scrollMargin}px)`,
  });
  const position = (index) => ({
    role: 'listitem',
    'aria-setsize': totalCount,
    'aria-posinset': positionOffset + index + 1,
  });
  const compact = listDensity === 'compact';
  const modifier = viewMode === 'card'
    ? ' dashboard-object-list-scroll--card'
    : viewMode === 'stream' ? ' dashboard-object-list-scroll--stream' : '';

  return (
    <div
      id="dashboard-object-list"
      ref={listScrollRef}
      className={`dashboard-object-list-scroll dashboard-density-${listDensity}${modifier}`}
      role="list"
      aria-label="Knowledge objects"
      tabIndex={-1}
    >
      <div role="presentation" style={{ height: `${listVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {listVirtualizer.getVirtualItems().map((virtualRow) => {
          if (viewMode === 'card') {
            const startIdx = virtualRow.index * cardColumns;
            return (
              <div key={`card-row-${virtualRow.index}`} role="presentation" className="object-card-grid-row-wrap" style={rowStyle(virtualRow)}>
                <div role="presentation" className="object-card-grid-row" style={{ gridTemplateColumns: `repeat(${cardColumns}, minmax(0, 1fr))` }}>
                  {objects.slice(startIdx, startIdx + cardColumns).map((rowObj, colIdx) => (
                    <DashboardObjectCard
                      key={rowObj.id}
                      obj={rowObj}
                      to={`/objects/${rowObj.id}${runPromptSuffix}`}
                      selected={selectedIds.has(rowObj.id)}
                      onToggleSelect={toggleSelect}
                      animationDelay={Math.min(startIdx + colIdx, 12) * 25}
                      compact={compact}
                      objectIndex={startIdx + colIdx}
                      runPromptSuffix={runPromptSuffix}
                      setSize={totalCount}
                      posInSet={positionOffset + startIdx + colIdx + 1}
                    />
                  ))}
                </div>
              </div>
            );
          }

          if (viewMode === 'stream') {
            const item = streamItems[virtualRow.index];
            if (!item) return null;
            if (item.kind === 'header') {
              return (
                <div key={item.id} role="presentation" style={rowStyle(virtualRow)}>
                  <StreamBucketHeader label={item.label} />
                </div>
              );
            }
            return (
              <div key={item.id} {...position(item.navIndex)} style={rowStyle(virtualRow)}>
                <TimelineRow
                  obj={item.obj}
                  to={`/objects/${item.obj.id}${runPromptSuffix}`}
                  selected={selectedIds.has(item.obj.id)}
                  onToggleSelect={toggleSelect}
                  selectionMode={selectionMode}
                  objectIndex={virtualRow.index}
                  navIndex={item.navIndex}
                  snippet={item.obj.snippet || item.obj.summary}
                  runPromptSuffix={runPromptSuffix}
                  listDensity={listDensity}
                />
              </div>
            );
          }

          const obj = objects[virtualRow.index];
          if (!obj) return null;
          return (
            <div key={obj.id} {...position(virtualRow.index)} data-object-index={virtualRow.index} style={rowStyle(virtualRow)}>
              <TableViewRow
                obj={obj}
                to={`/objects/${obj.id}${runPromptSuffix}`}
                selected={selectedIds.has(obj.id)}
                onToggleSelect={toggleSelect}
                selectionMode={selectionMode}
                objectIndex={virtualRow.index}
                compact={compact}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
