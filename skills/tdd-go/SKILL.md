---
name: tdd-go
description: >-
  Go-specific TDD patterns for verified development. Use when implementing Go code
  with TDD. Triggers on: Go test files, .go files, testdsl, Actor-based BDD,
  table-driven tests, rapid property tests, or Go test patterns.
  For TypeScript TDD, use the citypaul tdd skill instead.
version: 0.1.0
---

# Test-Driven Development (Go)

Every line of production code must be written in response to a failing test. TDD is the implementation discipline within verified development — Phase 3 (Implement) runs entirely through this cycle.

## The Cycle: RED -> GREEN -> REFACTOR

### RED: Write a Failing Test

Write a test that describes the desired behavior. Run it. Watch it fail.

Rules:
- Test describes WHAT, not HOW — test behavior, not implementation
- Test must actually fail (a real assertion failure, not a compilation error)
- Test name describes the behavior: `TestShouldApplyGoldCustomerDiscount`
- One logical assertion per test

### GREEN: Make It Pass

Write the minimum code to make the failing test pass. Nothing more.

Rules:
- Minimum means minimum — hardcode if that's enough for one test
- Don't anticipate future tests
- Don't add error handling for cases you haven't tested
- Don't refactor yet — just make it green

### REFACTOR: Improve Structure

Tests are green. Now improve the code without changing behavior.

Rules:
- Commit GREEN first, then refactor separately
- Run tests after every refactoring step
- If tests break during refactoring, you changed behavior — revert
- Refactoring targets: duplication, naming, complexity, extraction

### COMMIT

After each complete RED-GREEN-REFACTOR cycle:
- Verify all tests pass
- Ask the user before committing
- Commit message describes the behavior added

## Actor-Based BDD Testing Pattern

For Go projects, use the Actor-based BDD pattern with a test DSL:

### Structure

```go
func TestShouldCreateAndListApartments(t *testing.T) {
    dsl := NewTestDsl(t)

    // Given: preconditions
    dsl.Given().UsersRegistry().HasRegisteredClient("manager", roles)

    // When: action
    apartment := NewApartment(t, owner, WithName("Seaside Villa"))
    dsl.When().Client("manager").Sends(apartment.CreateApartmentRequest())

    // Then: expected outcome
    dsl.Then().Client("manager").Receives(apartment.ExpectedCreateApartmentResponse())

    // And: verify side effects
    dsl.When().Client("manager").Sends(ListApartmentsRequest())
    dsl.Then().Client("manager").Receives(ExpectedListResponse(t, apartment))
}
```

### Key Concepts

**Actors** represent participants in the system — users, services, external systems. Each actor can `Send` and `Receive` messages through the test DSL.

```go
dsl.Given().TimeController().SetTime(...)     // System actor
dsl.When().Client("admin").Sends(request)     // User actor
dsl.Then().Website().Receives(expectedPage)   // UI actor
dsl.Given().CMS().Stub(aboutPageRoute)        // External service actor
```

**Fixtures** encapsulate both the request to send and the expected response. They implement `MessageToSend` and `ExpectedMessage` interfaces:

```go
apartment := NewApartment(t, owner, WithName("Seaside Villa"))
apartment.CreateApartmentRequest()              // -> MessageToSend
apartment.ExpectedCreateApartmentResponse()     // -> ExpectedMessage
```

**CapturedData** flows through test steps. When a response is received, the fixture captures relevant data (IDs, timestamps) for use in subsequent requests:

```go
// Step 1: Create owner — captures owner.ID from response
dsl.When().Client().Sends(owner.CreateOwnerRequest())
dsl.Then().Client().Receives(owner.ExpectedCreateOwnerResponse())

// Step 2: Create apartment — uses captured owner.ID in request body
dsl.When().Client().Sends(apartment.CreateApartmentRequest())
// apartment.CreateApartmentRequest() calls GetCaptured(cd, owner) to get owner.ID
```

**Assertions** use cursor-based matching:
- `Receives(expected)` — assert one matching message exists
- `ReceivesOnly(a, b, c)` — assert exact count and order
- `ReceivesNothing()` — assert no unmatched messages remain
- `EventuallyReceives(action, expected)` — retry with polling

### Fixture Builder Pattern

Fixtures use functional options for configuration:

```go
apartment := NewApartment(t, owner,
    WithName("Seaside Villa"),
    WithRegistryID("REG-001"),
    WithAddress(testAddress),
)
```

For update scenarios, clone and modify:

```go
updated := original.Clone(func(a *ApartmentFixture) {
    a.Name = "Updated Name"
}).WithID(original.ID)
```

## What to Test

### Test behavior through public APIs

```
Good: Send HTTP request, assert response status and body
Bad:  Test internal helper functions directly
Bad:  Assert that an internal method was called with specific args
```

### Test boundaries that kill mutants

For every conditional, test both sides of the boundary:

```
if x >= 10:  test x=9 (false) AND x=10 (true)
if len == 0: test len=0 (true) AND len=1 (false)
if err != nil: test err=nil AND err=someError
```

### Property-based tests for invariants

Use `rapid` for properties that must hold across all inputs:

```go
func TestDiscount_NeverNegative(t *testing.T) {
    rapid.Check(t, func(t *rapid.T) {
        price := rapid.Float64Range(0, 100000).Draw(t, "price")
        pct := rapid.Float64Range(-100, 200).Draw(t, "pct")
        result := ApplyDiscount(price, pct)
        if result < 0 {
            t.Fatalf("negative result for price=%f pct=%f", result, price, pct)
        }
    })
}
```

### Test error paths

Every error return needs a test that triggers it:

```go
func TestShouldReturnBadRequestForInvalidRoles(t *testing.T) {
    dsl := NewTestDsl(t)
    client := NewClient(t, "id", "secret", []string{"invalid-role"})

    dsl.When().Client("manager").Sends(client.NewCreateClientRequest())
    dsl.Then().Client("manager").Receives(
        sent.ExpectedBadRequestResponse("Invalid role: invalid-role"))
}
```

## Anti-Patterns

### Writing production code without a failing test
If no test demanded the code, delete it. Write a failing test first.

### Tautological tests
```go
// Bad: reimplements the function logic
result := Add(2, 3)
assert.Equal(t, a+b, result)

// Good: encodes the expected output
result := Add(2, 3)
assert.Equal(t, 5, result)
```

### Over-mocking
Prefer real implementations: in-memory stores, `httptest` servers, test databases. Mocks hide integration bugs. Only mock:
- External services (third-party APIs)
- Non-deterministic behavior (time, randomness)
- Expensive resources in CI

### Speculative code
"Just in case" code without a test is a TDD violation. If the behavior matters, write a test. If no test exists, the code shouldn't exist.

### Testing implementation details
```go
// Bad: Assert cache.Set() was called with specific args
// Good: Assert second call returns cached value (tests the behavior)
```

## Verification Evidence

Before claiming a task is complete, show actual test output:

```
=== RUN   TestShouldCreateAndListApartments
--- PASS: TestShouldCreateAndListApartments (0.02s)
PASS
ok      myproject/testing/scenarios  0.03s
```

Never say "tests pass" without showing the output. Evidence before assertions.

## Integration with Verified Development

```
Phase 3 (Implement) loop:

  For each task in plan.md:
    1. RED    — Write failing test from acceptance scenario
    2. GREEN  — Write minimum implementation
    3. REFACTOR — Improve structure
    4. COMMIT — Atomic commit for this task
    5. Next task

  When all tasks complete:
    -> Phase 4 (Verify): run verify command
    -> Phase 5 (Review): /review
```
