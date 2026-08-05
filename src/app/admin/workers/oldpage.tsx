import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function WorkersPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] =
    useState("All Services");
  
  const [statusFilter, setStatusFilter] =
    useState("All Status");
  
    useEffect(() => {
      fetchWorkers();
    }, []);
    
    async function fetchWorkers() {
    
      setLoading(true);
    
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .order("created_at", {
          ascending: false,
        });
    
      if (error) {
    
        console.log(error);
    
      } else {
    
        setWorkers(data || []);
    
      }
    
      setLoading(false);
    
    }
    return (
      <div className="space-y-8">
  
        {/* Header */}
  
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
  
          <div>
            <h1 className="text-3xl font-bold text-homigo-primary">
              Workers Management
            </h1>
  
            <p className="mt-2 text-slate-500">
              Manage Homigo service professionals
            </p>
          </div>
  
  
          <button
            className="
            rounded-xl
            bg-green-600
            px-6
            py-3
            font-semibold
            text-white
            shadow
            transition
            hover:bg-green-700
            "
          >
            + Register Worker
          </button>
  
        </div>
  
  
  
        {/* Stats Cards */}
  
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
  
          {stats.map((item) => (
  
            <div
              key={item.title}
              className="
              rounded-2xl
              bg-white
              p-6
              shadow-sm
              border
              border-slate-100
              "
            >
  
              <div className="flex items-center justify-between">
  
                <p className="text-sm text-slate-500">
                  {item.title}
                </p>
  
                <span className="text-2xl">
                  {item.icon}
                </span>
  
              </div>
  
  
              <h2
                className="
                mt-4
                text-3xl
                font-bold
                text-homigo-primary
                "
              >
                {item.value}
              </h2>
  
  
            </div>
  
          ))}
  
        </div>
  
  
  
        {/* Filter Section */}
  
        <div
          className="
          rounded-2xl
          bg-white
          p-6
          shadow-sm
          border
          border-slate-100
          "
        >
  
          <div
            className="
            flex
            flex-col
            gap-4
            lg:flex-row
            lg:items-center
            lg:justify-between
            "
          >
  
  <input
placeholder="Search worker..."
value={search}
onChange={(e)=>setSearch(e.target.value)}

  
  
            <div className="flex flex-col gap-4 sm:flex-row">
  
  
  <select
value={serviceFilter}
onChange={(e)=>setServiceFilter(e.target.value)}

<select
value={statusFilter}
onChange={(e)=>setStatusFilter(e.target.value)}
  
  
  
            
  
  
            </div>
  
          </div>
                  {/* Desktop Table */}

        <div className="mt-8 hidden overflow-x-auto lg:block">

<table className="w-full border-separate border-spacing-y-3">

  <thead>

    <tr className="text-left text-sm text-slate-500">

      <th className="px-4 py-3">
        ID
      </th>

      <th className="px-4 py-3">
        Worker
      </th>

      <th className="px-4 py-3">
        Service
      </th>

      <th className="px-4 py-3">
        City
      </th>

      <th className="px-4 py-3">
        Rating
      </th>

      <th className="px-4 py-3">
        Jobs
      </th>

      <th className="px-4 py-3">
        Earnings
      </th>

      <th className="px-4 py-3">
        Status
      </th>

      <th className="px-4 py-3 text-center">
        Action
      </th>

    </tr>

  </thead>


  <tbody>

    {workers.map((worker) => (

      <tr
        key={worker.id}
        className="
        rounded-xl
        bg-slate-50
        text-sm
        shadow-sm
        "
      >

        <td className="rounded-l-xl px-4 py-5 font-semibold">
          {worker.id}
        </td>


        <td className="px-4 py-5">

          <div>

            <p className="font-semibold text-homigo-primary">
              {worker.name}
            </p>

            <p className="text-xs text-slate-500">
              {worker.phone}
            </p>

          </div>

        </td>


        <td className="px-4 py-5">
          {worker.service}
        </td>


        <td className="px-4 py-5">
          {worker.city}
        </td>


        <td className="px-4 py-5">
          ⭐ {worker.rating}
        </td>


        <td className="px-4 py-5">
          {worker.jobs}
        </td>


        <td className="px-4 py-5">
          {worker.earnings}
        </td>


        <td className="px-4 py-5">

          <span
            className={`
            rounded-full
            px-4
            py-2
            text-xs
            font-semibold
            ${
              worker.status === "Active"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }
            `}
          >

            {worker.status}

          </span>

        </td>


        <td className="rounded-r-xl px-4 py-5">

          <div className="flex justify-center gap-3">

            <button
              className="
              rounded-lg
              bg-blue-900
              px-4
              py-2
              text-white
              hover:bg-blue-800
              "
            >
              View
            </button>


            <button
              className="
              rounded-lg
              bg-yellow-400
              px-4
              py-2
              font-semibold
              hover:bg-yellow-300
              "
            >
              Edit
            </button>


          </div>

        </td>


      </tr>

    ))}


  </tbody>


</table>


</div>




{/* Mobile Cards */}

<div className="mt-8 space-y-4 lg:hidden">


{workers.map((worker) => (

  <div
    key={worker.id}
    className="
    rounded-2xl
    border
    bg-slate-50
    p-5
    shadow-sm
    "
  >


    <div className="flex justify-between">


      <div>

        <h3 className="font-bold text-homigo-primary">
          {worker.name}
        </h3>

        <p className="text-sm text-slate-500">
          {worker.service}
        </p>

      </div>


      <span
        className={`
        rounded-full
        px-3
        py-1
        text-xs
        ${
          worker.status === "Active"
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
        }
        `}
      >
        {worker.status}
      </span>


    </div>



    <div className="mt-4 space-y-2 text-sm">


      <p>
        📍 {worker.city}
      </p>

      <p>
        📞 {worker.phone}
      </p>

      <p>
        ⭐ {worker.rating} Rating
      </p>

      <p>
        Jobs Completed: {worker.jobs}
      </p>


    </div>



    <div className="mt-5 flex gap-3">


      <button
        className="
        flex-1
        rounded-lg
        bg-blue-900
        py-2
        text-white
        "
      >
        View
      </button>


      <button
        className="
        flex-1
        rounded-lg
        bg-yellow-400
        py-2
        font-semibold
        "
      >
        Edit
      </button>


    </div>


  </div>


))}


</div>



</div>


</div>

);
}