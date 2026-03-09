

## Plan: Give the AI Agent Access to the Candidate's CV

### Problem
The ElevenLabs agent starts a conversation without any knowledge of the candidate's CV. The CV is stored in the `cvs` storage bucket, and the interview record has a `cv_url` field linking to it, but this data is never passed to the agent.

### Approach
Use ElevenLabs' **conversation overrides** to dynamically inject the CV content into the agent's prompt when starting each session. This requires:

1. **Update the `elevenlabs-token` edge function** to:
   - Accept `interviewId` from the request body
   - Fetch the interview record to get `cv_url`, `role`, and `level`
   - Download the CV file from the `cvs` storage bucket
   - Extract text from the CV (for PDF files, use a text extraction approach; for simplicity, read raw text content)
   - Pass the CV text + role + level as `conversation_config_override` when requesting the conversation token from ElevenLabs, injecting it into the agent's system prompt

2. **Update `LiveInterview.tsx`** to:
   - Fetch the interview record on mount (to get role/level/cv_url)
   - Pass the `interviewId` to the edge function call

### Technical Details

**Edge Function (`elevenlabs-token/index.ts`)**:
- Receive `{ interviewId }` in the request body
- Use the Supabase service role client to fetch the interview and download the CV
- Use the ElevenLabs conversation token API with `conversation_config_override` to inject a dynamic prompt addition containing the CV content:
  ```
  POST /v1/convai/conversation/token
  Body: {
    agent_id: "...",
    conversation_config_override: {
      agent: {
        prompt: {
          prompt: "...base prompt + CV content + role + level..."
        }
      }
    }
  }
  ```

**Frontend (`LiveInterview.tsx`)**:
- Pass `id` (interview ID) when invoking the edge function
- Display the role/level in the pre-call screen for context

### Key Considerations
- PDF text extraction in Deno: We'll use a lightweight approach — fetch the file as text. For PDF binary files, we can use a Deno-compatible PDF parser or convert the CV to text server-side. A practical approach is to send the raw file content and let the LLM behind ElevenLabs handle it, or use a simple PDF-to-text library.
- The `cvs` bucket is private, so we need the service role key to download files.
- CV content will be truncated if too long (e.g., limit to ~4000 chars) to stay within prompt limits.

