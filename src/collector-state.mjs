// The scanner revisits already-staged IDs while continuing after queue capacity.
// Remove those from the pre-existing count instead of summing repeated traversals.
export function mergeScan(old,scan){
 const previous=old||{staged:0,unsupported:0,failed:0};
 return {found:Number(scan.found)||0,staged:previous.staged+(Number(scan.staged)||0),
  existing:Math.max(0,(Number(scan.existing)||0)-previous.staged-previous.unsupported),
  failed:previous.failed+(Number(scan.failed)||0),unsupported:previous.unsupported+(Number(scan.unsupported)||0),
  complete:scan.complete!==false,until:scan.until||old?.until||0};
}
