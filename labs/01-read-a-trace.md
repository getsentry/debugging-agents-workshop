# Lab 1. Read a trace

5 minutes. No code. The presenter drives.

A trace is the record of one request through a system. Each unit of work in
it is a span. A span has a name, an operation, a start time, a duration, and
attributes. Spans nest: a tool call sits under the model step that asked for
it, a database query sits under the tool.

Agent tracing adds attributes with the `gen_ai.` prefix. The ones you use in
this workshop:

| Attribute | Meaning |
| --- | --- |
| `gen_ai.request.model` | The model this step called |
| `gen_ai.usage.input_tokens` | Tokens sent to the model, this step |
| `gen_ai.usage.output_tokens` | Tokens the model wrote, this step |
| `gen_ai.usage.cache_read.input_tokens` | Tokens the provider served from its prompt cache |
| `gen_ai.tool.name`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result` | The tool the model called, with what it was given and what it returned |
| `gen_ai.conversation.id` | The thread this turn belongs to |
| `gen_ai.request.messages`, `gen_ai.response.text` | The prompt and the answer, when recording is on |

The presenter opens one trace from the reference storefront project. Follow
along and answer, in the workshop channel:

1. How many model steps did this turn take?
2. Which tool ran, and how long did its database query take?
3. How many input tokens did the last model step use? Why is it more than
   the first step?

## What to keep

The final answer the user saw is one span at the bottom. Everything above it
is why the answer looks the way it does. Debugging an agent means reading
upward.
