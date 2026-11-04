> **Unit 3 · Statistics and Econometrics.** Scoring unit: questions are formula-based. Learn the formulas and the properties of OLS by heart.

## 1. Descriptive statistics

| Measure | Formula / fact |
|---|---|
| Arithmetic mean | x̄ = Σx / n; sum of deviations from mean = 0 |
| Geometric mean | (x₁·x₂·…·xₙ)^(1/n); used for growth rates and index numbers |
| Harmonic mean | n / Σ(1/x); used for average speed, prices |
| Relation | **AM ≥ GM ≥ HM**; for two numbers **GM² = AM × HM** |
| Median | middle value; best for skewed data (income) |
| Mode | most frequent; empirical: **Mode = 3 Median − 2 Mean** |
| Variance | σ² = Σ(x − x̄)² / n |
| Coefficient of variation | CV = σ / x̄ × 100 (compare consistency) |
| Quartile deviation | (Q₃ − Q₁)/2 |
| Skewness (Karl Pearson) | (Mean − Mode)/σ; positive skew: Mean > Median > Mode |
| Kurtosis | β₂ = μ₄/μ₂²; = 3 mesokurtic (normal), > 3 leptokurtic, < 3 platykurtic |

- Mean deviation is least when taken from the **median**. Sum of squared deviations is least from the **mean**.

## 2. Probability and distributions
- P(A ∪ B) = P(A) + P(B) − P(A ∩ B). Independent: P(A ∩ B) = P(A)·P(B).
- **Bayes' theorem**: P(A|B) = P(B|A)·P(A) / P(B).

| Distribution | Mean | Variance | Notes |
|---|---|---|---|
| Binomial (n, p) | np | npq | mean > variance |
| Poisson (λ) | λ | λ | mean = variance; rare events |
| Normal (μ, σ²) | μ | σ² | symmetric; mean = median = mode; μ ± 1σ ≈ 68.27%, ±2σ ≈ 95.45%, ±3σ ≈ 99.73% |
| Uniform (a, b) | (a+b)/2 | (b−a)²/12 | |
| Chi-square (k df) | k | 2k | sum of squared standard normals |
| t (k df) | 0 | k/(k−2) | approaches normal as df → ∞ |
| F | ratio of two chi-squares | | used for variance ratio, joint tests |

- **Central limit theorem**: the sample mean is approximately normal for large n, whatever the population.
- Standard error of mean = σ/√n.

## 3. Sampling and hypothesis testing
- Sampling: simple random, stratified, systematic, cluster, multi-stage; non-random: quota, convenience, judgement.
- **Type I error** (α): rejecting a true H₀. **Type II error** (β): accepting a false H₀. **Power = 1 − β**.
- Tests: **z** (large sample, σ known), **t** (small sample), **χ²** (goodness of fit, independence, variance), **F** (equality of variances, ANOVA, joint significance).
- p-value < α → reject H₀.

## 4. Correlation and regression
- **Karl Pearson r** = Cov(X,Y) / (σx·σy); −1 ≤ r ≤ 1; unit-free; unaffected by change of origin and scale (sign may flip with negative scale).
- **Spearman rank correlation**: ρ = 1 − 6Σd² / [n(n² − 1)].
- Regression coefficients: byx = r·σy/σx, bxy = r·σx/σy; **r = ±√(byx·bxy)**, and both have the same sign as r. Both lines pass through (x̄, ȳ).
- **R²** = explained / total variation; in simple regression R² = r².
- **Adjusted R²** = 1 − (1 − R²)(n − 1)/(n − k); can fall when a useless variable is added.

## 5. Classical linear regression model (CLRM)
Y = β₀ + β₁X + u. OLS minimises Σû².

**Assumptions**: linear in parameters; E(u) = 0; homoscedasticity Var(u) = σ²; no autocorrelation; X non-stochastic / uncorrelated with u; no perfect multicollinearity; (for inference) u is normal.

- **Gauss–Markov theorem**: under these assumptions OLS is **BLUE** (Best Linear Unbiased Estimator). Normality is *not* needed for BLUE.
- OLS slope: β̂₁ = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)².
- t-test for individual coefficient; **F-test** for overall significance: F = [R²/(k−1)] / [(1−R²)/(n−k)].

## 6. Violations of assumptions

| Problem | Consequence for OLS | Detection | Remedy |
|---|---|---|---|
| **Multicollinearity** | still BLUE, but large standard errors, unstable signs, high R² with few significant t | VIF > 10, high pairwise r, Farrar–Glauber | drop variable, more data, ridge regression |
| **Heteroscedasticity** | unbiased but **not efficient**; SEs wrong | Park, Glejser, **Goldfeld–Quandt**, **Breusch–Pagan**, **White** | WLS/GLS, robust (White) SEs, log transform |
| **Autocorrelation** | unbiased but not efficient; R² and t overstated | **Durbin–Watson** d ≈ 2(1 − ρ); d ≈ 2 no autocorrelation, near 0 positive, near 4 negative; **Breusch–Godfrey** (LM) | GLS, Cochrane–Orcutt, first differencing |
| Specification error (omitted variable) | biased, inconsistent | Ramsey RESET | include variable |
| Errors in X / endogeneity | biased, inconsistent | Hausman test | instrumental variables (IV/2SLS) |

- DW test is invalid when a lagged dependent variable is a regressor → use **Durbin's h**.

## 7. Other econometrics topics
- **Dummy variables**: for m categories use m − 1 dummies (else **dummy variable trap**, perfect multicollinearity).
- **Chow test**: structural break.
- Distributed lag models: **Koyck** transformation; adaptive expectations, partial adjustment (Nerlove).
- **Simultaneous equations**: OLS gives biased estimates (**simultaneity bias**). Identification: **order condition** (K − k ≥ m − 1) and **rank condition**. Methods: ILS (exactly identified), **2SLS**, 3SLS, LIML.
- Time series: stationarity; **unit root** tests (Dickey–Fuller, ADF, Phillips–Perron); **spurious regression** (Granger–Newbold) when R² > DW; **cointegration** (Engle–Granger), **ECM**; **Granger causality**; ARIMA (Box–Jenkins); VAR.
- Limited dependent variables: **logit, probit**, Tobit.
- Panel data: fixed effects vs random effects (Hausman test decides).

## 8. Index numbers
| Index | Weights | Bias |
|---|---|---|
| **Laspeyres** | base-year quantities | upward |
| **Paasche** | current-year quantities | downward |
| **Fisher's ideal** | √(L × P) | satisfies **time reversal** and **factor reversal** tests |
| Marshall–Edgeworth | average of base and current quantities | satisfies time reversal |
| Dorbish–Bowley | (L + P)/2 | |

- **Chain-base** index, splicing, base shifting. Deflating: real value = nominal / price index × 100.
- India: **CPI** (NSO; base 2012 = 100; MoSPI is moving CPI to a newer base year, so check MoSPI for the current series) is used for inflation targeting. **WPI** (Office of Economic Adviser, DPIIT; base 2011-12). **IIP** base 2011-12.

## 9. Time series components
Trend (secular), seasonal, cyclical, irregular. Methods for trend: free-hand, semi-averages, moving averages, **least squares**.

## Exam traps
- OLS is BLUE without normality; normality is needed only for t and F tests in small samples.
- Multicollinearity does not make OLS biased.
- Fisher's index is called "ideal" because it satisfies both reversal tests (but not the circular test).
- For a symmetric distribution, skewness = 0 and mean = median = mode.
- r = 0 means no **linear** relation; there can still be a non-linear relation.
