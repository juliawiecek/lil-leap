package com.neueda.leap.order.execution.quote;
import java.util.Optional;
import java.util.UUID;
/** Reads order context immediately before execution pricing. */
public interface ExecutionOrderContextRepository { Optional<ExecutionOrderContext> findForExecution(UUID orderId); }
