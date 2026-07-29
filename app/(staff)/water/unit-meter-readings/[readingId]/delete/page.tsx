import { deleteUnitMeterReadingAction } from "../../actions";

export default async function DeleteUnitMeterReadingPage() {
  return (
    <form action={deleteUnitMeterReadingAction}>
      <input type="hidden" name="reading_id" value="" />
      <p>Delete confirmation placeholder</p>
    </form>
  );
}
