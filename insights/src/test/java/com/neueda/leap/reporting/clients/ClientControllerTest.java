package com.neueda.leap.reporting.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.security.JwtServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ClientController.class)
@Import({SecurityConfig.class, JwtServiceImpl.class, GlobalExceptionHandler.class})
class ClientControllerTest {

    /** Internal user ids, which no response returns; the owner's name and email are shown instead. */
    private static final Set<String> USER_ID_FIELDS = Set.of("userid", "user_id");

    @Autowired MockMvc mvc;
    @Autowired JwtServiceImpl jwtService;
    @Autowired ObjectMapper json;
    @MockBean ClientRepository clients;

    private final UUID accountId = UUID.randomUUID();
    private final UUID orderId = UUID.randomUUID();
    private final ClientDtos.ClientSummary account = new ClientDtos.ClientSummary(accountId, "NT-DEMO-0001",
            "Individual account", "Maya Chen", "maya.chen@example.test", "NOVICE", "BLOCKED", 2, new BigDecimal("5200.50"),
            Instant.parse("2026-10-16T14:00:00Z"));

    private void stubAccount() {
        when(clients.list(any())).thenReturn(ClientDtos.Page.of(List.of(account), 0, 25, 1));
        when(clients.summary(accountId)).thenReturn(Optional.of(account));
        when(clients.holdings(accountId)).thenReturn(List.of(
                new ClientDtos.Holding("AAPL", "Apple Inc.", 2, new BigDecimal("225.1000"), new BigDecimal("450.20"))));
        when(clients.orders(eq(accountId), any(), eq(0), eq(25))).thenReturn(ClientDtos.Page.of(List.of(
                new ClientDtos.Order(orderId, Instant.parse("2026-10-15T14:00:00Z"), "AAPL", "BUY", 2,
                        new BigDecimal("225.10"))), 0, 25, 1));
    }

    private List<String> routes() {
        return List.of("/reports/clients", "/reports/clients/" + accountId, "/reports/clients/" + accountId + "/orders");
    }

    @Test
    void noTokenIs401AndTradersAre403OnEveryClientRoute() throws Exception {
        for (String route : routes()) {
            mvc.perform(get(route)).andExpect(status().isUnauthorized());
            mvc.perform(asRole("TRADER", get(route))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(clients);
    }

    @Test
    void analystsAndOperationsStaffCanReadEveryClientRoute() throws Exception {
        stubAccount();
        for (String role : new String[]{"ANALYST", "OPERATIONS"}) {
            for (String route : routes()) {
                mvc.perform(asRole(role, get(route))).andExpect(status().isOk());
            }
        }
    }

    @Test
    void accountsShowTheOwnersNameAndEmailButNoResponseCarriesTheUserId() throws Exception {
        stubAccount();
        for (String route : routes()) {
            String body = mvc.perform(asRole("OPERATIONS", get(route))).andReturn().getResponse().getContentAsString();
            assertThat(fieldNames(json.readTree(body))).as(route).doesNotContainAnyElementsOf(USER_ID_FIELDS).isNotEmpty();
        }
        mvc.perform(asRole("ANALYST", get("/reports/clients")))
                .andExpect(jsonPath("$.content[0].clientName").value("Maya Chen"))
                .andExpect(jsonPath("$.content[0].email").value("maya.chen@example.test"));
        mvc.perform(asRole("ANALYST", get("/reports/clients/{id}", accountId)))
                .andExpect(jsonPath("$.account.clientName").value("Maya Chen"))
                .andExpect(jsonPath("$.account.email").value("maya.chen@example.test"));
    }

    @Test
    void listPassesValidatedFiltersAndReturnsAPage() throws Exception {
        stubAccount();

        mvc.perform(asRole("ANALYST", get("/reports/clients")
                        .param("search", "demo").param("level", "novice").param("status", "BLOCKED")
                        .param("sort", "tradedValue,desc").param("page", "0").param("size", "10")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].accountNumber").value("NT-DEMO-0001"))
                .andExpect(jsonPath("$.content[0].status").value("BLOCKED"))
                .andExpect(jsonPath("$.content[0].tradedValue").value(5200.50))
                .andExpect(jsonPath("$.totalElements").value(1));
        verify(clients).list(new ClientQuery("demo", "NOVICE", "BLOCKED", "tradedValue", true, 0, 10));
    }

    @Test
    void detailHasHoldingsAndOrdersArePagedSeparately() throws Exception {
        stubAccount();

        mvc.perform(asRole("ANALYST", get("/reports/clients/{id}", accountId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.accountId").value(accountId.toString()))
                .andExpect(jsonPath("$.holdings[0].symbol").value("AAPL"))
                .andExpect(jsonPath("$.holdings[0].costBasis").value(450.20));
        mvc.perform(asRole("OPERATIONS", get("/reports/clients/{id}/orders", accountId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].orderId").value(orderId.toString()))
                .andExpect(jsonPath("$.content[0].fillPrice").value(225.1));
        mvc.perform(asRole("OPERATIONS", get("/reports/clients/{id}/orders", accountId)
                .param("search", " AAPL ").param("page", "2").param("size", "5")));
        verify(clients).orders(accountId, "AAPL", 2, 5);
    }

    @Test
    void unknownAccountsAre404() throws Exception {
        UUID unknown = UUID.randomUUID();
        when(clients.summary(unknown)).thenReturn(Optional.empty());

        mvc.perform(asRole("ANALYST", get("/reports/clients/{id}", unknown))).andExpect(status().isNotFound());
        mvc.perform(asRole("ANALYST", get("/reports/clients/{id}/orders", unknown))).andExpect(status().isNotFound());
    }

    @Test
    void unknownFiltersSortsAndPageSizesAreBadRequests() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(
                get("/reports/clients").param("level", "EXPERT"),
                get("/reports/clients").param("status", "DELETED"),
                get("/reports/clients").param("sort", "user_id"),
                get("/reports/clients").param("sort", "accountNumber,sideways"),
                get("/reports/clients").param("sort", "accountNumber,asc,extra"),
                get("/reports/clients").param("size", "101"),
                get("/reports/clients").param("page", "-1"),
                get("/reports/clients").param("sort", "cashBalance"),
                get("/reports/clients/not-a-uuid"),
                get("/reports/clients/" + accountId + "/orders").param("size", "0"))) {
            mvc.perform(asRole("ANALYST", request)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(clients);
    }

    private static List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        if (node.isObject()) {
            for (Iterator<String> fields = node.fieldNames(); fields.hasNext(); ) {
                String field = fields.next();
                names.add(field.toLowerCase(Locale.ROOT));
                names.addAll(fieldNames(node.get(field)));
            }
        } else if (node.isArray()) {
            node.forEach(child -> names.addAll(fieldNames(child)));
        }
        return names;
    }

    private MockHttpServletRequestBuilder asRole(String role, MockHttpServletRequestBuilder request) {
        String token = jwtService.issueToken(UUID.randomUUID(), "synthetic.user@example.test", role);
        return request.header("Authorization", "Bearer " + token);
    }
}
