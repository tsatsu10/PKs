/**
 * Time bucket header for Stream view.
 */
export default function StreamBucketHeader({ label }) {
  return (
    <div className="stream-bucket-header" role="presentation">
      <span className="stream-bucket-header-label">{label}</span>
      <span className="stream-bucket-header-line" aria-hidden="true" />
    </div>
  );
}
