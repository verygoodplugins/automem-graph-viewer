import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { isAuthErrorMessage } from './api/client'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
      // The app talks to exactly one API — let the fetch itself decide whether
      // the network works. The default 'online' mode trusts the browser's
      // online-manager, and when that misdetects (managed/headless browsers,
      // some VPNs) a failed query parks at fetchStatus 'paused' FOREVER: no
      // retry, no error state, just an infinite spinner where the error card
      // should be.
      networkMode: 'always',
      // Auth rejections won't fix themselves — fail fast to the Access-denied
      // card instead of burning ~7s of futile retries.
      retry: (failureCount, error) =>
        !isAuthErrorMessage((error as Error)?.message ?? '') && failureCount < 3,
    },
    mutations: {
      networkMode: 'always',
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
