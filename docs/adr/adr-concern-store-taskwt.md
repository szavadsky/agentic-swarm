# Aggregate concerns directly to taskWt concerns/

Item steps commit only childWt (topic/{task}--{item}) while {task}/concerns/ lives on taskWt (topic/{task}). Precedent: writeQuestion and refreshStateYaml already write taskWt files during item steps, committed at wave merge/edits.
