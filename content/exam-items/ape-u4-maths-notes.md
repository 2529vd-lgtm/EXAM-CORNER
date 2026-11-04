> **Unit 4 · Mathematical Economics.** A few direct questions every year. Practise the worked examples; they repeat in new numbers.

## 1. Functions and derivatives
| Rule | Result |
|---|---|
| Power | d(xⁿ)/dx = n·xⁿ⁻¹ |
| Exponential | d(eˣ)/dx = eˣ; d(aˣ)/dx = aˣ ln a |
| Log | d(ln x)/dx = 1/x |
| Product | (uv)′ = u′v + uv′ |
| Quotient | (u/v)′ = (u′v − uv′)/v² |
| Chain | dy/dx = dy/du · du/dx |

- **Elasticity from a function**: e = (dQ/dP)·(P/Q). For Q = a·P⁻ᵇ, elasticity is constant = −b. For y = A·xⁿ, elasticity = n.
- Growth rate of a product = sum of growth rates; of a ratio = difference.

### Worked example: profit maximisation
TR = 100Q − 2Q², TC = 20Q + Q².
Profit π = 80Q − 3Q². dπ/dQ = 80 − 6Q = 0 → **Q = 13.33**. d²π/dQ² = −6 < 0 → maximum.
Check: MR = 100 − 4Q, MC = 20 + 2Q; MR = MC gives the same Q.

## 2. Optimisation
- One variable: f′(x) = 0 (first-order), f″(x) < 0 maximum, > 0 minimum.
- Two variables: f_x = f_y = 0; maximum if f_xx < 0 and **f_xx·f_yy − (f_xy)² > 0**.
- **Lagrange method** (constrained): maximise U(x, y) subject to Px·x + Py·y = M.
  L = U + λ(M − Px·x − Py·y). FOCs give **MUx/Px = MUy/Py = λ**.
  **λ = marginal utility of money** (shadow price of the constraint).
- Bordered Hessian decides max/min for constrained problems.

### Worked example: Cobb–Douglas demand
U = x^α·y^(1−α), budget M. Demand: **x = αM/Px**, **y = (1−α)M/Py**. The consumer spends a fixed share α of income on x. Own-price elasticity = −1, income elasticity = 1, cross elasticity = 0.

## 3. Homogeneous functions
- f(tx, ty) = tᵏ·f(x, y) → homogeneous of degree k. Cobb–Douglas AL^αK^β is homogeneous of degree α + β.
- **Euler's theorem**: x·f_x + y·f_y = k·f. With k = 1: factor payments by MP exhaust output.
- Demand functions are homogeneous of degree **0** in prices and income (no money illusion).

## 4. Integration (consumer and producer surplus)
- ∫xⁿ dx = xⁿ⁺¹/(n+1) + C. TC = ∫MC dQ + fixed cost.
- **Consumer surplus** = ∫₀^Q₀ D(Q) dQ − P₀Q₀.
- Example: P = 50 − 2Q, P₀ = 30 → Q₀ = 10. CS = ½ × 10 × (50 − 30) = **100**.

## 5. Matrices and input–output
- Determinant of 2×2 [a b; c d] = ad − bc. **Cramer's rule** solves linear systems.
- Inverse exists only if the determinant ≠ 0 (non-singular).
- Rank = number of linearly independent rows.
- **Leontief input–output model** (1941; Nobel 1973): X = AX + D → **X = (I − A)⁻¹D**. (I − A)⁻¹ is the **Leontief inverse**.
- **Hawkins–Simon conditions**: all principal minors of (I − A) must be positive for a viable (non-negative) solution. Column sums of A < 1 means each sector is productive.
- Open model has final demand outside; closed model treats households as a sector.

## 6. Linear programming
- Objective linear, constraints linear inequalities, non-negativity.
- Optimal solution lies at a **corner (vertex)** of the feasible region.
- **Simplex method**: G.B. Dantzig (1947). Every primal has a **dual**; optimal values are equal (**duality theorem**). Dual variables = **shadow prices**.
- Activity analysis: Koopmans; Kantorovich (Nobel 1975).

## 7. Difference and differential equations
- **Cobweb model**: Qd(t) = a − bP(t), Qs(t) = c + dP(t−1).
  - Convergent if **d < b**: supply responds less to price than demand does. In the usual price–quantity diagram this means the **supply curve is steeper than the demand curve**.
  - Explosive if d > b; continuous oscillation if d = b.
- First-order differential equation dy/dt = ay → y = y₀eᵃᵗ (growth if a > 0).
- Stability of market (Walras): price rises with excess demand. **Marshallian** stability: quantity adjusts to excess demand price.
- Harrod–Domar and Solow are solved with differential equations (see Unit 8).

## 8. Game theory (mathematical side)
- **Saddle point**: an element that is the minimum of its row and maximum of its column. Then maximin = minimax = value of the game.
- Mixed strategy for 2×2 without saddle point: player 1 plays row 1 with probability p = (d − c)/[(a + d) − (b + c)] for payoff matrix [a b; c d].
- Nash equilibrium may be in pure or mixed strategies (Nash proved a mixed equilibrium always exists for finite games).

## 9. Production and cost maths
- For Q = AL^αK^β: MPL = αQ/L, MPK = βQ/K, MRTS = (α/β)(K/L).
- Elasticity of substitution σ = d ln(K/L) / d ln(MRTS). Cobb–Douglas σ = 1; Leontief σ = 0; linear (perfect substitutes) σ = ∞.
- Cost minimisation with Cobb–Douglas gives cost function C = k·Q^(1/(α+β))·w^(α/(α+β))·r^(β/(α+β)).

## Exam traps
- Second-order condition matters: a stationary point may be a minimum.
- λ in consumer problem = marginal utility of income, not of a good.
- Hawkins–Simon is about the (I − A) matrix, not A.
- In the cobweb model, stability depends on the **relative slopes** of the curves.
