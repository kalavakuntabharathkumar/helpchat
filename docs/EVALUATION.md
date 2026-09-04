# Evaluation design

The included 30-question set is a small regression suite, not a claim of production model accuracy.

Each question has:
- a topic label
- required terms that should appear in a safe, context-grounded answer

The runner compares two system prompts and reports average keyword hit rate.

For a production evaluation, replace the lightweight keyword metric with human labels or
an LLM-as-judge rubric covering correctness, groundedness, refusal safety, completeness,
and tone. Keep a fixed test set for regression and a separate holdout set for iteration.
