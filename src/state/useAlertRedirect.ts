import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { isCheckActive } from '../core/trip';
import { useTripSnapshot } from './TripContext';

export function useAlertRedirect(): void {
  const router = useRouter();
  const snapshot = useTripSnapshot();
  const checkActive = snapshot.trip !== null && isCheckActive(snapshot.trip);
  const wasActive = useRef(false);

  useEffect(() => {
    if (checkActive && !wasActive.current) {
      router.push('/alert');
    }
    wasActive.current = checkActive;
  }, [checkActive, router]);
}
