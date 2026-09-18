"""Regression and Quality Tests for Academic Quiz Question Generation.

Validates:
1. Deterministic rejection of document-navigation/structure questions (chapters, sections, pages, TOC).
2. Acceptance of genuine academic subject knowledge questions (definitions, calculations, comparisons, mechanisms).
3. Accurate identification and filtering of Table of Contents and metadata chunks.
4. Options validation (rejection of section number options like 'Section 4.2').
"""

import pytest
from app.services.question_validator import (
    is_toc_or_metadata_chunk,
    validate_quiz_question_quality,
)


# ==============================================================================
# 1. Explicit Bad-Question Fixtures (MUST BE REJECTED)
# ==============================================================================

BAD_QUESTION_FIXTURES = [
    # Explicit examples from specification
    ("In Chapter 3 (Probability and Information Theory), what is the topic of Section 3.4 as listed in the table of contents?", ["Random Variables", "Probability Distributions", "Marginal Probability", "Conditional Probability"]),
    ("According to Chapter 4 (Numerical Computation), which section covers 'Constrained Optimization'?", ["Section 4.2", "Section 4.3", "Section 4.4", "Section 4.5"]),
    ("What is the topic of Section 3.4?", ["Random Variables", "Probability Distributions", "Marginal Probability", "Conditional Probability"]),
    ("Which section covers Constrained Optimization?", ["Section 4.1", "Section 4.2", "Section 4.3", "Section 4.4"]),
    ("Which chapter discusses Linear Regression?", ["Chapter 2", "Chapter 3", "Chapter 4", "Chapter 5"]),
    # Additional navigation / TOC patterns
    ("On what page is Bayes theorem introduced?", ["Page 56", "Page 89", "Page 120", "Page 140"]),
    ("Which page contains the definition of marginal probability?", ["Page 75", "Page 80", "Page 92", "Page 104"]),
    ("Where is marginal probability discussed in the text?", ["Chapter 3", "Chapter 4", "Chapter 5", "Chapter 6"]),
    ("What is the title of Section 4.2?", ["Overflow", "Conditioning", "Constrained Optimization", "Linear Models"]),
    ("According to the table of contents, what follows Section 3.3?", ["Section 3.4", "Section 3.5", "Section 4.1", "Section 4.2"]),
    ("In which section is gradient descent covered?", ["Section 4.3", "Section 4.4", "Section 4.5", "Section 4.6"]),
    ("What is discussed in which section of chapter 3?", ["Section 3.1", "Section 3.2", "Section 3.3", "Section 3.4"]),
]


@pytest.mark.parametrize("q_text, options", BAD_QUESTION_FIXTURES)
def test_bad_question_fixtures_rejected(q_text: str, options: list[str]) -> None:
    """Ensure all document-structure / navigation questions are deterministically rejected."""
    is_valid, reason = validate_quiz_question_quality(q_text, options=options)
    assert not is_valid, f"Expected bad question to be rejected, but passed: '{q_text}' (reason: {reason})"


def test_banned_option_patterns_rejected() -> None:
    """Ensure questions whose options are section numbers are rejected even if the prompt seems neutral."""
    q_text = "Identify the appropriate material for constrained optimization:"
    options = ["Section 4.2", "Section 4.3", "Section 4.4", "Section 4.5"]
    is_valid, reason = validate_quiz_question_quality(q_text, options=options)
    assert not is_valid
    assert "section" in reason.lower()


# ==============================================================================
# 2. Explicit Good-Question Fixtures (MUST BE ACCEPTED)
# ==============================================================================

GOOD_QUESTION_FIXTURES = [
    # Probability & Information Theory examples from specification
    ("What is marginal probability?", [
        "The probability distribution of a subset of variables calculated from a joint distribution",
        "The probability of an event given that another event has occurred",
        "The total variance of independent random variables",
        "The cumulative distribution of a continuous random variable",
    ]),
    ("Given P(A,B), how can P(A) be obtained?", [
        "By summing or integrating P(A,B) over all possible values of B",
        "By multiplying P(A,B) by P(B)",
        "By taking the derivative of P(A,B) with respect to A",
        "By computing the cross-entropy of P(A) and P(B)",
    ]),
    ("What is the difference between joint probability and conditional probability?", [
        "Joint probability is the likelihood of two events occurring together, while conditional probability is the likelihood of an event given another occurred",
        "Joint probability applies only to continuous variables while conditional applies to discrete",
        "There is no mathematical difference; both represent P(A|B)",
        "Conditional probability is the sum of independent marginal probabilities",
    ]),
    ("If P(A)=0.6 and P(B|A)=0.5, what is P(A∩B)?", [
        "0.30",
        "0.10",
        "1.10",
        "0.83",
    ]),
    ("What does entropy measure in information theory?", [
        "The expected amount of information or uncertainty in a random variable",
        "The rate of convergence in numerical gradient descent",
        "The curvature of the objective function near local optima",
        "The number of parameters in a feedforward network",
    ]),
    ("How does conditional probability differ from marginal probability?", [
        "Conditional probability conditions on known evidence whereas marginal probability integrates out other variables",
        "Marginal probability requires Bayes rule while conditional does not",
        "Conditional probability is always equal to 1.0",
        "Marginal probability can only be evaluated for uniform distributions",
    ]),
    ("What is the purpose of Bayes' theorem?", [
        "To calculate posterior probabilities by inverting conditional probabilities with prior knowledge",
        "To invert non-singular square matrices in linear algebra",
        "To prevent gradient vanishing in deep recurrent architectures",
        "To evaluate the definite integral of arbitrary non-linear functions",
    ]),
    # Numerical Computation examples from specification
    ("What is constrained optimization?", [
        "Optimizing an objective function subject to equality or inequality restrictions on its variables",
        "Finding an unconstrained global minimum using pure gradient descent",
        "Solving a system of linear equations without bounds",
        "Approximating eigenvalues using power iteration",
    ]),
    ("What distinguishes constrained optimization from unconstrained optimization?", [
        "The feasible solution set is bounded or restricted by explicit constraint equations",
        "It uses higher learning rates than unconstrained optimization",
        "Unconstrained optimization always yields infeasible points",
        "Constrained optimization cannot be solved using numerical algorithms",
    ]),
    ("Why are constraints important in an optimization problem?", [
        "They represent physical, statistical, resource, or mathematical boundaries on valid solutions",
        "They guarantee that the cost function is strictly convex",
        "They eliminate the need for objective function gradients",
        "They double the dimensionality of the parameter space",
    ]),
    # Machine Learning examples from specification
    ("What is supervised learning? Give an example.", [
        "Learning a predictive mapping from labeled inputs to outputs, such as classifying emails as spam or not spam",
        "Clustering unlabeled data points into k distinct clusters based on similarity",
        "Learning an optimal policy through trial-and-error reward signals in an environment",
        "Compressing high-dimensional data into orthogonal principal components",
    ]),
    ("How does linear regression minimize prediction error?", [
        "By optimizing model weights to minimize the mean squared error loss between predictions and true targets",
        "By projecting training points onto random Fourier feature bases",
        "By maximizing the margin between hyperplanes using support vectors",
        "By iteratively splitting feature dimensions with highest Gini impurity",
    ]),
    ("What is the difference between classification and regression?", [
        "Classification predicts discrete categorical labels whereas regression predicts continuous numeric values",
        "Regression is supervised while classification is unsupervised",
        "Classification minimizes mean squared error while regression uses log loss",
        "Regression can only accept single-dimensional inputs",
    ]),
    ("Why can a decision tree overfit the training data?", [
        "Because it can grow deep enough to memorize noise and idiosyncrasies of the training samples",
        "Because its loss function is strictly non-convex and gets stuck in local minima",
        "Because gradient descent diverges when learning rate is high",
        "Because decision trees cannot model non-linear boundaries",
    ]),
    ("How does gradient descent update model parameters?", [
        "By adjusting parameters in the direction opposite to the gradient of the loss function scaled by a learning rate",
        "By randomly sampling parameters from a Gaussian prior distribution",
        "By computing the matrix inverse of the feature covariance matrix",
        "By exchanging weights between parallel models in an ensemble",
    ]),
]


@pytest.mark.parametrize("q_text, options", GOOD_QUESTION_FIXTURES)
def test_good_question_fixtures_accepted(q_text: str, options: list[str]) -> None:
    """Ensure substantive academic questions testing concepts, definitions, and problem-solving are accepted."""
    is_valid, reason = validate_quiz_question_quality(q_text, options=options)
    assert is_valid, f"Expected good question to be accepted, but was rejected: '{q_text}' (reason: {reason})"


# ==============================================================================
# 3. Table of Contents & Metadata Chunk Detection Tests
# ==============================================================================

def test_is_toc_or_metadata_chunk_dot_leaders() -> None:
    """Chunks with classic dot leaders and page numbers must be detected as TOC."""
    toc_chunk = (
        "CONTENTS\n"
        "3.2 Random Variables . . . . . . . . . . . . . . . . . . . . . . . . . . 56\n"
        "3.3 Probability Distributions . . . . . . . . . . . . . . . . . . . . . . 56\n"
        "3.4 Marginal Probability . . . . . . . . . . . . . . . . . . . . . . . 58\n"
        "3.5 Conditional Probability . . . . . . . . . . . . . . . . . . . . . . 59\n"
    )
    assert is_toc_or_metadata_chunk(toc_chunk) is True


def test_is_toc_or_metadata_chunk_chapter_index() -> None:
    """Chunks listing chapter sections with page references must be detected as TOC."""
    toc_chunk = (
        "Contents\n"
        "1 Introduction 1\n"
        "1.1 Who Should Read This Book? . . . . . . . . . . . . . . . . . . . . 8\n"
        "1.2 Historical Trends in Deep Learning . . . . . . . . . . . . . . . . . 11\n"
    )
    assert is_toc_or_metadata_chunk(toc_chunk) is True


def test_is_toc_or_metadata_chunk_front_matter() -> None:
    """Front matter with copyright / publisher alone must be detected as non-substantive."""
    meta_chunk = "Deep Learning. Ian Goodfellow, Yoshua Bengio, Aaron Courville. MIT Press. All rights reserved. Published 2016."
    assert is_toc_or_metadata_chunk(meta_chunk) is True


def test_is_toc_or_metadata_chunk_accepts_explanatory_body() -> None:
    """Genuine body text with definitions, formulas, and explanations must NOT be marked as TOC."""
    explanatory_chunk = (
        "CHAPTER 3. PROBABILITY AND INFORMATION THEORY\n\n"
        "The name 'marginal probability' comes from the process of computing marginal probabilities "
        "on paper. When the values of P(x, y) are written in a grid with rows corresponding to x and columns "
        "corresponding to y, it is natural to sum across the rows to calculate P(x) and write the sum in the margin "
        "of the paper. For discrete random variables, marginal probability is calculated via the sum rule: "
        "P(x) = sum_y P(x, y). For continuous random variables, we replace the summation with integration."
    )
    assert is_toc_or_metadata_chunk(explanatory_chunk) is False


def test_is_toc_or_metadata_chunk_constrained_optimization_explanation() -> None:
    """Constrained optimization explanation chunk must be accepted as substantive evidence."""
    substantive_chunk = (
        "Chapter 4. Numerical Computation\n\n"
        "Sometimes we wish not only to maximize or minimize a function f(x) over all possible values of x, "
        "but also to impose constraints on which values of x are acceptable. This is called constrained optimization. "
        "Points that lie within the set S that satisfies the constraints are called feasible points. "
        "A common approach to constrained optimization is to modify the objective function so that the constraints "
        "are satisfied using the Karush-Kuhn-Tucker (KKT) approach and generalized Lagrange multipliers."
    )
    assert is_toc_or_metadata_chunk(substantive_chunk) is False
