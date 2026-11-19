# NEXIST Quantum Neural AI — experimental design note

**Status:** experimental prototype, not peer-reviewed  
**Implementation:** dependency-free Python state-vector simulator and browser demonstration  
**Purpose:** test whether a small variational quantum classifier can learn candidate-suitability labels and contribute a measured score to a NEXIST portfolio experiment.

## 1. Model boundary

This is a supervised variational quantum classifier (VQC/QNN), not a large language model. It does not understand unrestricted natural language. The optional external language model only converts a planning prompt into structured candidate drafts. Quantum suitability inference and training are performed by the QNN simulator.

The current feature vector has four values in [0, 1], representing declared benefit signal, benefit density, budget margin, and dependency simplicity. They are demonstration features and must be evaluated or replaced with a domain-validated feature schema before any serious application.

## 2. Quantum circuit

The simulator starts in \\( |0000\\rangle \\). A four-feature angle map applies feature-dependent rotations:

\\[
|\\phi(x)\\rangle = \\left(\\prod_{i=0}^{3} R_z(\\pi(x_i-0.5))R_y(\\pi x_i)\\right)|0000\\rangle.
\\]

Two variational layers apply trainable \\(R_y(\\theta)\\) and \\(R_z(\\theta)\\) rotations followed by a CNOT chain and a closing entangling CNOT:

\\[
|\\psi(x,\\theta)\\rangle = U_{var}(\\theta) |\\phi(x)\\rangle.
\\]

The readout consists of Pauli-Z expectation values:

\\[
z_i = \\langle \\psi(x,\\theta)|Z_i|\\psi(x,\\theta)\\rangle.
\\]

A classical sigmoid head predicts a binary label:

\\[
p(y=1|x)=\\sigma\\left(b+\\sum_i w_i z_i\\right).
\\]

The output is an uncalibrated score until calibration and held-out testing are performed.

## 3. Training

The prototype minimises binary cross-entropy on examples labelled by a human or by a documented dataset. Variational gradients use the parameter-shift identity for each single-use rotation parameter:

\\[
\\frac{\\partial z_i}{\\partial \\theta_j}
= \\frac{z_i(\\theta_j+\\pi/2)-z_i(\\theta_j-\\pi/2)}{2}.
\\]

The classifier's readout weights and bias are updated by a classical gradient step. Each circuit evaluation is performed by a classical state-vector simulator with 16 complex amplitudes for four qubits. This makes it runnable on ordinary CPUs but does not make the computation a physical quantum execution.

## 4. NEXIST and QAOA integration

The QNN output is supplied as `SelectionCandidate.qnn_suitability`, constrained to [0, 1]. The portfolio utility is currently:

\\[
U_i=B_i(0.5+p_i)
\\]

where \\(B_i\\) is the user-declared benefit. A neutral score of 0.5 gives the original benefit. This adjustment lets the QNN influence the QAOA-style selection cost function without replacing budget, dependency, conflict, or evidence constraints.

The NEXIST evidence gate remains separate. A QNN prediction is not evidence. Neither QNN nor QAOA may grant approval or realise a unit.

## 5. Required evaluation before stronger claims

1. Collect a domain-specific dataset with a written labelling guide and independent reviewers.
2. Separate train, validation, and held-out test data before training.
3. Compare against logistic regression, a small classical MLP, and a non-variational feature baseline on the same splits.
4. Report accuracy, precision, recall, F1, ROC-AUC where appropriate, calibration error, variance across seeds, training time, memory, and circuit-evaluation count.
5. Test feature leakage, class imbalance, label disagreement, out-of-distribution examples, and the impact of feature normalisation.
6. Compare state-vector simulation with an available quantum-hardware backend only after simulator reproducibility and noise-aware evaluation are established.

No current result establishes quantum advantage, a quantum speedup, better generalisation than classical models, or suitability for high-stakes decisions.
