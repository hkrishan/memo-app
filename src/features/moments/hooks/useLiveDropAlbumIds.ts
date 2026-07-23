import { useMemo } from "react";

import { useOpenDropsQuery } from "../api/moments.queries";

/**
 * Album ids that currently have an OPEN drop the user hasn't posted to.
 * Backed by the same query the global takeover keeps fresh (foreground,
 * socket `moment:drop`, moment pushes), so any badge consuming this
 * updates live. Deliberately ignores takeover dismissal — "live" means a
 * post is still owed; the id disappears once the user posts because the
 * open-drops query excludes submitted events.
 *
 * Call once per list/screen, not per card.
 */
export function useLiveDropAlbumIds(): Set<string> {
  const { data: drops } = useOpenDropsQuery();

  return useMemo(
    () => new Set((drops ?? []).map((drop) => drop.albumId)),
    [drops],
  );
}

export default useLiveDropAlbumIds;
