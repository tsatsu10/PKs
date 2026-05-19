import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '../src/features/dashboard/components/DashboardView.jsx');
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('Command palette (Cmd/Ctrl+K)'));
const end = lines.findIndex((l, i) => i > start && l.trim().startsWith('<BulkActionRibbon'));

const insert = `
        <DashboardCommandPalette
          open={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          query={commandPaletteQuery}
          onQueryChange={setCommandPaletteQuery}
          selectedIndex={commandPaletteSelected}
          onSelectedIndexChange={setCommandPaletteSelected}
          inputRef={commandPaletteInputRef}
          filteredLengthRef={commandPaletteFilteredLengthRef}
          actionsRef={commandPaletteActionsRef}
          objects={objects}
          navigate={navigate}
        />

        <DashboardModals
          showExportModal={showExportModal}
          setShowExportModal={setShowExportModal}
          exportScope={exportScope}
          setExportScope={setExportScope}
          exportFormat={exportFormat}
          setExportFormat={setExportFormat}
          exportTemplate={exportTemplate}
          setExportTemplate={setExportTemplate}
          exporting={exporting}
          handleExportSelected={handleExportSelected}
          selectedIds={selectedIds}
          bulkModal={bulkModal}
          setBulkModal={setBulkModal}
          bulkDomainId={bulkDomainId}
          setBulkDomainId={setBulkDomainId}
          bulkTagId={bulkTagId}
          setBulkTagId={setBulkTagId}
          bulkType={bulkType}
          setBulkType={setBulkType}
          bulkStatus={bulkStatus}
          setBulkStatus={setBulkStatus}
          bulkActionLoading={bulkActionLoading}
          domains={domains}
          tags={tags}
          createDomainInline={createDomainInline}
          createTagInline={createTagInline}
          bulkAddDomain={bulkAddDomain}
          bulkAddTag={bulkAddTag}
          bulkRemoveDomain={bulkRemoveDomain}
          bulkRemoveTag={bulkRemoveTag}
          bulkDelete={bulkDelete}
          bulkChangeType={bulkChangeType}
          bulkSetStatus={bulkSetStatus}
        />
`.trim().split('\n');

const out = [...lines.slice(0, start), ...insert, ...lines.slice(end)];
fs.writeFileSync(p, out.join('\n'));
console.log('Patched DashboardView:', { start, end, removed: end - start });
