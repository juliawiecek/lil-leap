/**
 * Internal reporting and insights over aggregated trading activity.
 *
 * <p>Reports are read from a reporting store that is populated asynchronously
 * from trading events, so reporting queries never compete with live trading
 * workloads. All endpoints are restricted to internal ANALYST users.</p>
 */
package com.neueda.leap.reporting;
