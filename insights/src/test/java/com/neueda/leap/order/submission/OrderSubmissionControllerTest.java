package com.neueda.leap.order.submission;

import com.neueda.leap.order.submission.controller.OrderSubmissionController;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrderSubmissionController.class)
class OrderSubmissionControllerTest {
    @Autowired
    MockMvc mvc;
    @MockBean
    OrderSubmissionService service;

    @Test
    void orderSubmissionEndpointShouldNoLongerBeExposed() throws Exception {
        mvc.perform(post("/orders"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
}
