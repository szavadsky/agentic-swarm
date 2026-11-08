# Autonomous immediate halt accepted

Mode table says autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately; deferral needs drain scheduling.
