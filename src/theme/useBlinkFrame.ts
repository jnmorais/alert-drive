import { useEffect, useState } from 'react';

import { BLINK_PHASE_DURATION } from '../core/alertView';
import type { BlinkFrame } from './alertColors';

function nextFrame(frame: BlinkFrame): BlinkFrame {
  return frame === 0 ? 1 : 0;
}

export function useBlinkFrame(active: boolean): BlinkFrame {
  const [frame, setFrame] = useState<BlinkFrame>(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    const handle = setInterval(() => setFrame(nextFrame), BLINK_PHASE_DURATION);
    return () => clearInterval(handle);
  }, [active]);

  return active ? frame : 0;
}
